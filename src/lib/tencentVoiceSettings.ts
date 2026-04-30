export interface VoiceApiSettings {
  appId: string;
  secretId: string;
  secretKey: string;
  engine: string;
  hotwordId: string;
}

export const VOICE_API_SETTINGS_KEY = 'testing_group_voice_api_settings';

export function getDefaultVoiceApiSettings(): VoiceApiSettings {
  return {
    appId: '',
    secretId: '',
    secretKey: '',
    engine: '16k_zh',
    hotwordId: '',
  };
}

export function normalizeVoiceApiSettings(settings: Partial<VoiceApiSettings>): VoiceApiSettings {
  return {
    appId: settings.appId?.trim() || '',
    secretId: settings.secretId?.trim() || '',
    secretKey: settings.secretKey?.trim() || '',
    engine: settings.engine?.trim() || '16k_zh',
    hotwordId: settings.hotwordId?.trim() || '',
  };
}

export function loadVoiceApiSettings(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage) {
  if (!storage) return getDefaultVoiceApiSettings();
  const saved = storage.getItem(VOICE_API_SETTINGS_KEY);
  if (!saved) return getDefaultVoiceApiSettings();
  try {
    return normalizeVoiceApiSettings(JSON.parse(saved));
  } catch {
    return getDefaultVoiceApiSettings();
  }
}
