export function formatTencentVoiceError(error: unknown) {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const details = error as { message?: unknown; reason?: unknown; code?: unknown };
    if (details.code === 1006 || String(details.code) === '1006') {
      return '腾讯云实时语音 WebSocket 连接异常断开（1006）。请优先检查 AppId、SecretId、SecretKey 是否属于同一个腾讯云账号，实时语音识别中国大陆流量是否已开通，浏览器网络是否能访问 asr.cloud.tencent.com。';
    }
    const message = details.message || details.reason || details.code;
    if (message) return String(message);
  }
  return '腾讯云语音识别失败，请检查 API 设置或网络';
}
