export function localTarget(raw: string | undefined) {
  if (!raw) throw new Error('Local database configuration missing');
  const url = new URL(raw);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1' || url.port !== '54329' || !['/abasong_local', '/abasong_d0'].includes(url.pathname) || url.search || url.hash) {
    throw new Error('Refusing target outside isolated D0 database');
  }
  return url;
}
