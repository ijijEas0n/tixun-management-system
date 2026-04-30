import assert from 'node:assert/strict';

import { getDefaultVoiceApiSettings, loadVoiceApiSettings, normalizeVoiceApiSettings } from './tencentVoiceSettings';

const defaults = getDefaultVoiceApiSettings();
assert.deepEqual(defaults, {
  appId: '',
  secretId: '',
  secretKey: '',
  engine: '16k_zh',
  hotwordId: '',
});

assert.deepEqual(normalizeVoiceApiSettings({
  appId: ' 123 ',
  secretId: ' sid ',
  secretKey: ' sk ',
  engine: '',
  hotwordId: ' hot ',
}), {
  appId: '123',
  secretId: 'sid',
  secretKey: 'sk',
  engine: '16k_zh',
  hotwordId: 'hot',
});

assert.deepEqual(loadVoiceApiSettings({
  getItem: () => '{bad json',
}), defaults);

assert.deepEqual(loadVoiceApiSettings({
  getItem: () => JSON.stringify({
    appId: ' app ',
    secretId: ' id ',
    secretKey: ' key ',
    engine: ' 16k_zh_video ',
  }),
}), {
  appId: 'app',
  secretId: 'id',
  secretKey: 'key',
  engine: '16k_zh_video',
  hotwordId: '',
});
