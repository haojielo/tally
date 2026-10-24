/* Tally: starts pdf.js's worker with the Safari polyfills already in place.
   Module imports run in order, so the polyfills are installed before pdf.js loads. */
import './stream-polyfill.js';
import './pdf.worker.min.js';
