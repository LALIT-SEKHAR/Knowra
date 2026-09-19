/**
 * pdfjs-dist 6.x uses Map.prototype.getOrInsertComputed (Chrome 134+).
 * Polyfill so PDF rendering works on current Safari / older Chromium.
 */
export function installPdfCompatPolyfills() {
  const proto = Map.prototype as Map<unknown, unknown> & {
    getOrInsert?: (key: unknown, defaultValue: unknown) => unknown;
    getOrInsertComputed?: (key: unknown, callback: (key: unknown) => unknown) => unknown;
  };

  if (typeof proto.getOrInsert !== 'function') {
    proto.getOrInsert = function getOrInsert(key, defaultValue) {
      if (this.has(key)) return this.get(key);
      this.set(key, defaultValue);
      return defaultValue;
    };
  }

  if (typeof proto.getOrInsertComputed !== 'function') {
    proto.getOrInsertComputed = function getOrInsertComputed(key, callback) {
      if (this.has(key)) return this.get(key);
      const value = callback(key);
      this.set(key, value);
      return value;
    };
  }
}
