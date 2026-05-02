import assert from 'node:assert/strict';
import { createEmptyVoiceSessionState } from './voiceSessionState';

const emptyState = createEmptyVoiceSessionState();

assert.deepEqual(emptyState, {
  text: '',
  reviewItems: [],
  unmatchedSegments: [],
  contextTermCount: 0,
});
