const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Int16Array(128).fill(-1);
for (let i = 0; i < 64; i++) LOOKUP[ALPHABET.charCodeAt(i)] = i;

/** Characters in the base64 text for this many bytes. */
export const base64Length = (bytes: number): number => 4 * Math.ceil(bytes / 3);

/** Bytes to base64 text. Written out here so src/core needs no browser functions. */
export function encodeBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  const CHUNK = 3 * 4096;
  for (let start = 0; start < bytes.length; start += CHUNK) {
    const end = Math.min(bytes.length, start + CHUNK);
    let s = '';
    for (let i = start; i < end; i += 3) {
      const a = bytes[i];
      const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
      const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
      s += ALPHABET[a >> 2] + ALPHABET[((a & 3) << 4) | (b >> 4)];
      s += i + 1 < bytes.length ? ALPHABET[((b & 15) << 2) | (c >> 6)] : '=';
      s += i + 2 < bytes.length ? ALPHABET[c & 63] : '=';
    }
    parts.push(s);
  }
  return parts.join('');
}

/** Base64 text to bytes. Returns null if the text is not valid base64. */
export function decodeBase64(text: string): Uint8Array | null {
  const n = text.length;
  if (n % 4 !== 0) return null;
  let pad = 0;
  if (n > 0 && text[n - 1] === '=') pad++;
  if (n > 1 && text[n - 2] === '=') pad++;
  const out = new Uint8Array((n / 4) * 3 - pad);
  let o = 0;
  for (let i = 0; i < n; i += 4) {
    let v = 0;
    for (let k = 0; k < 4; k++) {
      const ch = text.charCodeAt(i + k);
      let d: number;
      if (ch === 61 && i + k >= n - pad) d = 0;
      else {
        d = ch < 128 ? LOOKUP[ch] : -1;
        if (d < 0) return null;
      }
      v = (v << 6) | d;
    }
    if (o < out.length) out[o++] = (v >> 16) & 255;
    if (o < out.length) out[o++] = (v >> 8) & 255;
    if (o < out.length) out[o++] = v & 255;
  }
  return out;
}
