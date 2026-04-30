declare module 'tencentcloud-speech-sdk-js/app/webaudiospeechrecognizer.js' {
  export interface TencentSpeechRecognitionResult {
    voice_text_str?: string;
    [key: string]: unknown;
  }

  export interface TencentWebAudioSpeechRecognizerParams {
    appid: string | number;
    secretid: string;
    signCallback: (signStr: string) => string;
    engine_model_type: string;
    voice_format?: number;
    hotword_id?: string;
    needvad?: number;
    filter_dirty?: number;
    filter_modal?: number;
    filter_punc?: number;
    convert_num_mode?: number;
    word_info?: number;
    vad_silence_time?: number;
  }

  export default class WebAudioSpeechRecognizer {
    constructor(params: TencentWebAudioSpeechRecognizerParams);
    start(): void;
    stop(): void;
    OnRecognitionStart: (res: TencentSpeechRecognitionResult) => void;
    OnSentenceBegin: (res: TencentSpeechRecognitionResult) => void;
    OnRecognitionResultChange: (res: TencentSpeechRecognitionResult) => void;
    OnSentenceEnd: (res: TencentSpeechRecognitionResult) => void;
    OnRecognitionComplete: (res: TencentSpeechRecognitionResult) => void;
    OnError: (res: unknown) => void;
  }
}
