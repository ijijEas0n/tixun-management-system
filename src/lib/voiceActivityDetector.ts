export type VoiceAutoStopReason = 'no-speech' | 'silence-after-speech';

export interface VoiceActivityConfig {
  speechThreshold: number;
  minSpeechMs: number;
  silenceMsToAutoStop: number;
  initialSilenceMsToAutoStop: number;
}

export interface VoiceActivitySample {
  timestampMs: number;
  level: number;
}

export interface VoiceActivityState {
  firstTimestampMs: number;
  lastTimestampMs: number;
  currentSpeechStartedAtMs: number | null;
  lastConfirmedSpeechAtMs: number | null;
  hasConfirmedSpeech: boolean;
  shouldAutoStop: boolean;
  autoStopReason: VoiceAutoStopReason | null;
}

export interface BrowserVoiceActivityCallbacks {
  onActivity?: (state: VoiceActivityState, level: number) => void;
  onAutoStop: (reason: VoiceAutoStopReason) => void;
}

export interface BrowserVoiceActivityController {
  stop: () => void;
}

export const DEFAULT_VOICE_ACTIVITY_CONFIG: VoiceActivityConfig = {
  speechThreshold: 0.018,
  minSpeechMs: 280,
  silenceMsToAutoStop: 2200,
  initialSilenceMsToAutoStop: 12000,
};

export function createVoiceActivityState(startTimestampMs: number): VoiceActivityState {
  return {
    firstTimestampMs: startTimestampMs,
    lastTimestampMs: startTimestampMs,
    currentSpeechStartedAtMs: null,
    lastConfirmedSpeechAtMs: null,
    hasConfirmedSpeech: false,
    shouldAutoStop: false,
    autoStopReason: null,
  };
}

export function updateVoiceActivityState(
  state: VoiceActivityState,
  sample: VoiceActivitySample,
  config: VoiceActivityConfig = DEFAULT_VOICE_ACTIVITY_CONFIG,
): VoiceActivityState {
  if (state.shouldAutoStop) return state;

  const isSpeech = sample.level >= config.speechThreshold;
  const currentSpeechStartedAtMs = isSpeech
    ? state.currentSpeechStartedAtMs ?? sample.timestampMs
    : null;
  const hasLongEnoughSpeech = isSpeech && sample.timestampMs - currentSpeechStartedAtMs >= config.minSpeechMs;
  const hasConfirmedSpeech = state.hasConfirmedSpeech || hasLongEnoughSpeech;
  const lastConfirmedSpeechAtMs = hasLongEnoughSpeech
    ? sample.timestampMs
    : state.lastConfirmedSpeechAtMs;

  if (!hasConfirmedSpeech && sample.timestampMs - state.firstTimestampMs >= config.initialSilenceMsToAutoStop) {
    return {
      ...state,
      lastTimestampMs: sample.timestampMs,
      currentSpeechStartedAtMs,
      shouldAutoStop: true,
      autoStopReason: 'no-speech',
    };
  }

  if (
    hasConfirmedSpeech &&
    lastConfirmedSpeechAtMs !== null &&
    sample.timestampMs - lastConfirmedSpeechAtMs >= config.silenceMsToAutoStop
  ) {
    return {
      ...state,
      lastTimestampMs: sample.timestampMs,
      currentSpeechStartedAtMs,
      lastConfirmedSpeechAtMs,
      hasConfirmedSpeech,
      shouldAutoStop: true,
      autoStopReason: 'silence-after-speech',
    };
  }

  return {
    ...state,
    lastTimestampMs: sample.timestampMs,
    currentSpeechStartedAtMs,
    lastConfirmedSpeechAtMs,
    hasConfirmedSpeech,
  };
}

function getRmsLevel(data: Uint8Array) {
  let sum = 0;
  data.forEach(value => {
    const centered = (value - 128) / 128;
    sum += centered * centered;
  });
  return Math.sqrt(sum / data.length);
}

export async function startBrowserVoiceActivityDetector(
  config: VoiceActivityConfig,
  callbacks: BrowserVoiceActivityCallbacks,
): Promise<BrowserVoiceActivityController> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  let audioContext: AudioContext | null = null;
  let analyser: AnalyserNode;
  try {
    const browserWindow = window as Window & typeof globalThis & {
      webkitAudioContext?: typeof AudioContext;
    };
    const AudioContextClass = browserWindow.AudioContext || browserWindow.webkitAudioContext;
    if (!AudioContextClass) throw new Error('当前浏览器不支持本地语音结束检测');
    audioContext = new AudioContextClass();
    const source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
  } catch (error) {
    stream.getTracks().forEach(track => track.stop());
    if (audioContext) void audioContext.close();
    throw error;
  }

  const data = new Uint8Array(analyser.fftSize);
  let state = createVoiceActivityState(performance.now());
  let stopped = false;
  let frameId = 0;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (frameId) window.cancelAnimationFrame(frameId);
    stream.getTracks().forEach(track => track.stop());
    void audioContext?.close();
  };

  const tick = () => {
    if (stopped) return;
    analyser.getByteTimeDomainData(data);
    const level = getRmsLevel(data);
    state = updateVoiceActivityState(state, { timestampMs: performance.now(), level }, config);
    callbacks.onActivity?.(state, level);
    if (state.shouldAutoStop && state.autoStopReason) {
      callbacks.onAutoStop(state.autoStopReason);
      stop();
      return;
    }
    frameId = window.requestAnimationFrame(tick);
  };

  frameId = window.requestAnimationFrame(tick);
  return { stop };
}
