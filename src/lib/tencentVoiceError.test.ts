import assert from 'node:assert/strict';

import { formatTencentVoiceError, isTencentVoiceCloseCode } from './tencentVoiceError';

assert.match(formatTencentVoiceError({ code: 1006 }), /WebSocket 连接异常断开/);
assert.match(formatTencentVoiceError({ code: 1006 }), /AppId/);
assert.equal(formatTencentVoiceError('鉴权失败'), '鉴权失败');
assert.equal(formatTencentVoiceError({ message: '服务未开通' }), '服务未开通');
assert.equal(isTencentVoiceCloseCode({ code: 1006 }, 1006), true);
assert.equal(isTencentVoiceCloseCode({ code: '1006' }, 1006), true);
assert.equal(isTencentVoiceCloseCode({ code: 4002 }, 1006), false);
