import assert from 'node:assert/strict';
import {
  DEFAULT_VOICE_ACTIVITY_CONFIG,
  createVoiceActivityState,
  updateVoiceActivityState,
} from './voiceActivityDetector';

const config = {
  ...DEFAULT_VOICE_ACTIVITY_CONFIG,
  speechThreshold: 0.02,
  minSpeechMs: 300,
  silenceMsToAutoStop: 1800,
  initialSilenceMsToAutoStop: 5000,
};

let initialSilence = createVoiceActivityState(0);
[1000, 2500, 5100].forEach(timestampMs => {
  initialSilence = updateVoiceActivityState(initialSilence, { timestampMs, level: 0.005 }, config);
});

assert.equal(initialSilence.shouldAutoStop, true);
assert.equal(initialSilence.autoStopReason, 'no-speech');

let afterSpeech = createVoiceActivityState(0);
[
  { timestampMs: 100, level: 0.01 },
  { timestampMs: 300, level: 0.04 },
  { timestampMs: 650, level: 0.05 },
  { timestampMs: 900, level: 0.004 },
  { timestampMs: 1700, level: 0.004 },
  { timestampMs: 2600, level: 0.004 },
].forEach(sample => {
  afterSpeech = updateVoiceActivityState(afterSpeech, sample, config);
});

assert.equal(afterSpeech.hasConfirmedSpeech, true);
assert.equal(afterSpeech.shouldAutoStop, true);
assert.equal(afterSpeech.autoStopReason, 'silence-after-speech');

let shortNoise = createVoiceActivityState(0);
[
  { timestampMs: 100, level: 0.05 },
  { timestampMs: 180, level: 0.004 },
  { timestampMs: 900, level: 0.004 },
].forEach(sample => {
  shortNoise = updateVoiceActivityState(shortNoise, sample, config);
});

assert.equal(shortNoise.hasConfirmedSpeech, false);
assert.equal(shortNoise.shouldAutoStop, false);
