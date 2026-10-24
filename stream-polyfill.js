/* Tally: small polyfills for features pdf.js uses that Safari does not have yet.
   - Async iteration of ReadableStream (`for await (const chunk of stream)`), Safari 27+.
   - Response.prototype.bytes() and Blob.prototype.bytes(), Safari 18+.
   Loaded on the page before pdf.js, and inside pdf.js's worker by pdf.worker.shim.js. */
(() => {
  const RS = globalThis.ReadableStream;
  if (RS && typeof RS.prototype[Symbol.asyncIterator] !== 'function') {
    const values = function values({ preventCancel = false } = {}) {
      const reader = this.getReader();
      let finished = false;
      const finish = () => { finished = true; try { reader.releaseLock(); } catch { /* already released */ } };
      return {
        async next() {
          if (finished) return { done: true, value: undefined };
          try {
            const r = await reader.read();
            if (r.done) finish();
            return r;
          } catch (e) { finish(); throw e; }
        },
        async return(value) {
          if (!finished) {
            const cancel = preventCancel ? null : reader.cancel(value);
            finish();
            if (cancel) await cancel;
          }
          return { done: true, value };
        },
        [Symbol.asyncIterator]() { return this; },
      };
    };
    Object.defineProperty(RS.prototype, 'values', { value: values, writable: true, configurable: true });
    Object.defineProperty(RS.prototype, Symbol.asyncIterator, { value: values, writable: true, configurable: true });
  }
  for (const C of [globalThis.Response, globalThis.Blob]) {
    if (C && typeof C.prototype.bytes !== 'function') {
      Object.defineProperty(C.prototype, 'bytes', {
        value: async function bytes() { return new Uint8Array(await this.arrayBuffer()); },
        writable: true, configurable: true,
      });
    }
  }
})();
