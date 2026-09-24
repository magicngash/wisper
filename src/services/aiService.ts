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
    const reader = new FileReader();
    const base64Promise = new Promise<string>((resolve, reject) => {
      reader.onloadend = () => {
        const result = reader.result as string;
        // strip data:...;base64, header
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
    });
    reader.readAsDataURL(audioBlob);

    const base64Data = await base64Promise;

    const response = await fetch('/api/transcribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audioBase64: base64Data,
        mimeType: audioBlob.type || 'audio/webm',
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
