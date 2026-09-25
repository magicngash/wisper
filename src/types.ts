export type RecordingState = 'idle' | 'recording' | 'transcribing' | 'refining' | 'error';

export interface ProcessingStage {
  stage: 'idle' | 'stage1_stt' | 'stage2_refine' | 'complete';
  message: string;
}

export interface SampleSpeech {
  id: string;
  title: string;
  category: string;
  description: string;
  rawText: string;
}

declare global {
  interface Window {
    cleanSpeechDesktop?: {
      isDesktop: boolean;
      onStartRecording: (callback: () => void) => () => void;
      onStopRecording: (callback: () => void) => () => void;
      insertText: (text: string) => void;
      notifyError: (message: string) => void;
      setOverlayStatus: (status: RecordingState, label: string, detail: string, recordingTime?: number) => void;
    };
  }
}
