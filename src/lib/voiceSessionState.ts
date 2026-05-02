import type { VoiceRecognitionCandidate } from './voiceRecognitionPipeline';

export interface VoiceSessionState {
  text: string;
  reviewItems: VoiceRecognitionCandidate[];
  unmatchedSegments: string[];
  contextTermCount: number;
}

export function createEmptyVoiceSessionState(): VoiceSessionState {
  return {
    text: '',
    reviewItems: [],
    unmatchedSegments: [],
    contextTermCount: 0,
  };
}
