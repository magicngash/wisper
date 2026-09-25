/**
 * Service for interacting with the Clean Speech backend APIs.
 */

export async function refineTranscript(rawTranscript: string): Promise<string> {
  const trimmed = rawTranscript.trim();
  if (!trimmed) {
    throw new Error('Please speak or provide text before refining.');
  }

  try {
    const response = await fetch('/api/refine', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ rawTranscript: trimmed }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to refine the transcript. Please try again.');
    }

    if (!data.refinedTranscript) {
      throw new Error('Received an empty refinement from the AI engine.');
    }

    return data.refinedTranscript;
  } catch (err: any) {
    if (err.message && err.message.includes('Failed to fetch')) {
      throw new Error('Network error: Unable to connect to the refinement server.');
    }
    throw err;
  }
}

export async function transcribeAudioBlob(audioBlob: Blob): Promise<string> {
  try {
    // MediaRecorder produces WebM in Chromium. Convert it to mono 16 kHz PCM
    // WAV so the local Whisper runtime can decode it without FFmpeg.
    const audioContext = new AudioContext();
    const decoded = await audioContext.decodeAudioData(await audioBlob.arrayBuffer());
    const targetSampleRate = 16000;
    const targetLength = Math.max(1, Math.round(decoded.duration * targetSampleRate));
    const mono = new Float32Array(targetLength);

    for (let i = 0; i < targetLength; i += 1) {
      const sourcePosition = (i / targetSampleRate) * decoded.sampleRate;
      const left = Math.floor(sourcePosition);
      const right = Math.min(left + 1, decoded.length - 1);
      const amount = sourcePosition - left;
      let sample = 0;
      for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
        const data = decoded.getChannelData(channel);
        sample += data[left] * (1 - amount) + data[right] * amount;
      }
      mono[i] = sample / decoded.numberOfChannels;
    }
    await audioContext.close();

    const wav = new ArrayBuffer(44 + mono.length * 2);
    const view = new DataView(wav);
    const writeString = (offset: number, value: string) => {
      for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
    };
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + mono.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, targetSampleRate, true);
    view.setUint32(28, targetSampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, mono.length * 2, true);
    for (let i = 0; i < mono.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, mono[i]));
      view.setInt16(44 + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    }

    const reader = new FileReader();
    const base64Data = await new Promise<string>((resolve, reject) => {
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(new Blob([wav], { type: 'audio/wav' }));
    });

    const response = await fetch('/api/transcribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audioBase64: base64Data,
        mimeType: 'audio/wav',
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Speech transcription could not be completed.');
    }

    return data.rawTranscript || '';
  } catch (err: any) {
    if (err.message && err.message.includes('Failed to fetch')) {
      throw new Error('Network error: Unable to connect to the transcription server.');
    }
    throw err;
  }
}
