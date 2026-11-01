// Old smart-TV browsers (Samsung Tizen 4/5 runs Chrome 56-63) lack newer
// built-ins. Load this before anything else in src/index.js.
import 'react-app-polyfill/stable';

// Create React App's Babel setup picks core-js polyfills from the core-js 3.0
// list, so anything core-js added later is silently left out. Fill in the
// ones this app's code and Supabase use by hand.

// globalThis (Chrome 71). Supabase reads it when its module loads.
if (typeof window !== 'undefined' && typeof window.globalThis === 'undefined') {
  window.globalThis = window;
}

// Promise.allSettled (Chrome 76).
if (typeof Promise.allSettled !== 'function') {
  Promise.allSettled = function allSettled(items) {
    return Promise.all(Array.from(items, (item) => Promise.resolve(item).then(
      (value) => ({ status: 'fulfilled', value }),
      (reason) => ({ status: 'rejected', reason }),
    )));
  };
}

// Object.hasOwn (Chrome 93).
if (typeof Object.hasOwn !== 'function') {
  Object.hasOwn = function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(Object(object), key);
  };
}

// AbortController arrived in Chrome 66. Supabase and the router create one;
// this stand-in lets that code run. It can't cancel a fetch already sent.
if (typeof window !== 'undefined' && typeof window.AbortController === 'undefined') {
  class AbortSignalShim {
    constructor() {
      this.aborted = false;
      this.reason = undefined;
      this.onabort = null;
      this.listeners = [];
    }

    addEventListener(type, fn) {
      if (type === 'abort' && typeof fn === 'function') this.listeners.push(fn);
    }

    removeEventListener(type, fn) {
      this.listeners = this.listeners.filter((item) => item !== fn);
    }

    throwIfAborted() {
      if (this.aborted) throw this.reason;
    }
  }

  class AbortControllerShim {
    constructor() {
      this.signal = new AbortSignalShim();
    }

    abort(reason) {
      const { signal } = this;
      if (signal.aborted) return;
      signal.aborted = true;
      signal.reason = reason === undefined ? new Error('Aborted') : reason;
      const event = { type: 'abort', target: signal };
      if (typeof signal.onabort === 'function') signal.onabort(event);
      signal.listeners.slice().forEach((fn) => fn(event));
    }
  }

  window.AbortController = AbortControllerShim;
  window.AbortSignal = window.AbortSignal || AbortSignalShim;
}
