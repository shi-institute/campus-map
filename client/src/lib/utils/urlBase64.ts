/**
 * Creates a URL-safe base64 encoding of a string.
 *
 * @param str - The input string to encode.
 * @returns The URL-safe base64 encoded string.
 */
export function base64UrlEncode(str: string) {
  return btoa(str).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', ''); // remove trailing padding
}

/**
 * Decodes a URL-safe base64 encoded string.
 *
 * @param str - The URL-safe base64 encoded string to decode.
 * @returns The decoded string.
 */
export function base64UrlDecode(str: string) {
  // add padding as needed
  let padded = str;
  while (padded.length % 4 !== 0) {
    padded += '=';
  }

  // revert to standard base64 characters
  const base64 = padded.replaceAll('-', '+').replaceAll('_', '/');

  // decode
  return atob(base64);
}
