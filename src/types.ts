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
