/**
 * Modular Speech-to-Text provider service.
 * Supports native Web Speech API (instant live transcription) with
 * MediaRecorder fallback to local Whisper transcription.
 */

import { transcribeAudioBlob } from './aiService.ts';

// Browser type declaration for Web Speech API
declare global {
  interface Window {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  }
}

export class SpeechRecorderService {
  private recognition: any | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private mediaStream: MediaStream | null = null;
  private audioChunks: Blob[] = [];
  private accumulatedText: string = '';
  private interimText: string = '';

  public isSupported(): boolean {
    return !!(
      navigator?.mediaDevices?.getUserMedia ||
      (typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition))
    );
  }

  public async startRecording(
    onTranscriptUpdate: (text: string, isInterim: boolean) => void,
    onError: (errorMessage: string) => void
  ): Promise<void> {
    this.accumulatedText = '';
    this.interimText = '';
    this.audioChunks = [];

    // 1. Request microphone stream
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        throw new Error('Microphone permission was denied. Please enable microphone access in your browser settings.');
      }
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        throw new Error('No microphone device was detected. Please plug in or connect a microphone.');
      }
      throw new Error(`Microphone access error: ${err.message || 'Unable to access microphone'}`);
    }

    // 2. Initialize MediaRecorder as a local Whisper fallback
    try {
      let mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
          mimeType = 'audio/ogg';
        }
      }

      this.mediaRecorder = new MediaRecorder(this.mediaStream, { mimeType });
      this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };
      this.mediaRecorder.start(250); // collect every 250ms
    } catch (mrError) {
      console.warn('MediaRecorder not fully supported on this device, relying on SpeechRecognition:', mrError);
    }

    // 3. Initialize SpeechRecognition if available
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRec) {
      try {
        const recognition = new SpeechRec();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event: any) => {
          let currentInterim = '';
          let finalDelta = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalDelta += transcript + ' ';
            } else {
              currentInterim += transcript;
            }
          }

          if (finalDelta) {
            this.accumulatedText = (this.accumulatedText + ' ' + finalDelta).replace(/\s+/g, ' ').trim();
          }

          this.interimText = currentInterim;

          const combined = (this.accumulatedText + (this.interimText ? ' ' + this.interimText : '')).trim();
          onTranscriptUpdate(combined, !!this.interimText);
        };

        recognition.onerror = (event: any) => {
          console.warn('SpeechRecognition event error:', event.error);
          if (event.error === 'not-allowed') {
            onError('Microphone permission was denied for speech recognition.');
          }
        };

        recognition.start();
        this.recognition = recognition;
      } catch (recError) {
        console.warn('SpeechRecognition failed to start:', recError);
      }
    }
  }

  public async stopRecording(): Promise<string> {
    // Stop Web Speech Recognition
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {
        // ignore
      }
      this.recognition = null;
    }

    // Stop MediaRecorder and wait for completion
    let audioBlob: Blob | null = null;
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      const stoppedPromise = new Promise<Blob>((resolve) => {
        if (!this.mediaRecorder) return resolve(new Blob());
        this.mediaRecorder.onstop = () => {
          const type = this.mediaRecorder?.mimeType || 'audio/webm';
          resolve(new Blob(this.audioChunks, { type }));
        };
      });
      this.mediaRecorder.stop();
      audioBlob = await stoppedPromise;
    }

    // Release microphone tracks
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    // Finalize text
    const finalText = (this.accumulatedText + ' ' + this.interimText).trim();

    // If Web Speech API captured text, return it directly
    if (finalText && finalText.length > 0) {
      return finalText;
    }

    // Fallback: if browser speech recognition is unavailable or reports a
    // network error, transcribe the recording locally with Whisper.
    if (audioBlob && audioBlob.size > 2000) {
      const serverTranscribed = await transcribeAudioBlob(audioBlob);
      if (serverTranscribed && serverTranscribed.trim()) {
        return serverTranscribed.trim();
      }
    }

    throw new Error('No speech was detected. Please check your microphone, speak clearly, or try a sample speech prompt.');
  }

  public cancel(): void {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {}
      this.recognition = null;
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch (e) {}
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    this.audioChunks = [];
    this.accumulatedText = '';
    this.interimText = '';
  }
}

export const speechRecorder = new SpeechRecorderService();
