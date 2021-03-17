'use strict';

// Use the built-in implementations if they are present.
try {
  const {
    setTimeout,
    setImmediate,
    setInterval,
  } = require('timers/promises');

  module.exports = {
    setTimeout,
    setImmediate,
    setInterval,
  };

  return;
} catch {
  // Do nothing with the error.
}

class AbortError extends Error {
  constructor() {
    super('The operation was aborted');
    this.code = 'ABORT_ERR';
    this.name = 'AbortError';
  }
}

class ERR_INVALID_ARG_TYPE extends TypeError {
  constructor(name, type) {
    super(`${name} must be of type ${type}`);
    this.code = 'ERR_INVALID_ARG_TYPE';
  }
}

if (typeof globalThis.setImmediate !== 'function') {
  globalThis.setImmediate = function(handler, ...args) {
    return setTimeout(handler, 0, ...args);
  };
  globalThis.clearImmediate = globalThis.clearTimeout;
}

const _setTimeout = globalThis.setTimeout;
const _setImmediate = globalThis.setImmediate;
const _setInterval = globalThis.setInterval;

function cancelListenerHandler(timer, clear, reject) {
  clear(timer);
  reject(new AbortError());
}

function validateAbortSignal(signal, name) {
  if (signal !== undefined &&
      (signal === null ||
       typeof signal !== 'object' ||
       !('aborted' in signal))) {
    throw new ERR_INVALID_ARG_TYPE(name, 'AbortSignal');
  }
}

function validateObject(
  value,
  name, {
    nullable = false,
    allowArray = false,
    allowFunction = false,
  } = {}) {
  if ((!nullable && value === null) ||
      (!allowArray && Array.isArray(value)) ||
      (typeof value !== 'object' && (
        !allowFunction || typeof value !== 'function'
      ))) {
    throw new ERR_INVALID_ARG_TYPE(name, 'Object');
  }
}

function validateBoolean(value, name) {
  if (typeof value !== 'boolean')
    throw new ERR_INVALID_ARG_TYPE(name, 'boolean');
}

function setTimeout(after, value, options = {}) {
  if (options == null || typeof options !== 'object')
    return Promise.reject(new ERR_INVALID_ARG_TYPE('options', 'Object'));
  const { signal, ref = true } = options;
  try {
    validateAbortSignal(signal, 'options.signal');
  } catch (err) {
    return Promise.reject(err);
  }
  if (typeof ref !== 'boolean')
    return Promise.reject(new ERR_INVALID_ARG_TYPE('options.ref', 'boolean'));
  if (signal?.aborted)
    return Promise.reject(new AbortError());
  let oncancel;
  const ret = new Promise((resolve, reject) => {
    const timeout = _setTimeout(resolve, after, value);
    if (typeof timeout?.unref === 'function' && !ref)
      timeout.unref();
    if (signal) {
      oncancel =
        cancelListenerHandler.bind(
          undefined,
          timeout,
          clearTimeout,
          reject);
      signal.addEventListener('abort', oncancel, { once: true });
    }
  });
  return oncancel !== undefined ?
    ret.finally(() => signal.removeEventListener('abort', oncancel)) : ret;
}

function setImmediate(value, options = {}) {
  if (options == null || typeof options !== 'object')
    return Promise.reject(new ERR_INVALID_ARG_TYPE('options', 'Object'));
  const { signal, ref = true } = options;
  try {
    validateAbortSignal(signal, 'options.signal');
  } catch (err) {
    return Promise.reject(err);
  }
  if (typeof ref !== 'boolean')
    return Promise.reject(new ERR_INVALID_ARG_TYPE('options.ref', 'boolean'));
  if (signal?.aborted)
    return Promise.reject(new AbortError());
  let oncancel;
  const ret = new Promise((resolve, reject) => {
    const immediate = _setImmediate(resolve, value);
    if (typeof immediate?.unref === 'function' && !ref)
      immediate.unref();
    if (signal) {
      oncancel =
        cancelListenerHandler.bind(
          undefined,
          immediate,
          clearImmediate,
          reject);
      signal.addEventListener('abort', oncancel, { once: true });
    }
  });
  return oncancel !== undefined ?
    ret.finally(() => signal.removeEventListener('abort', cancel)) : ret;
}

async function* setInterval(after, value, options = {}) {
  validateObject(options, 'options');
  const { signal, ref = true } = options;
  validateAbortSignal(signal, 'options.signal');
  validateBoolean(ref, 'options.ref');

  if (signal?.aborted)
    throw new AbortError();

  let onCancel;
  let interval;
  try {
    let notYielded = 0;
    let callback;
    interval = _setInterval(() => {
      notYielded++;
      if (callback) {
        callback();
        callback = undefined;
      }
    }, after);
    if (typeof interval?.unref === 'function' && !ref)
      interval.unref();
    if (signal) {
      onCancel = () => {
        clearInterval(interval);
        if (callback) {
          callback(Promise.reject(new AbortError()));
          callback = undefined;
        }
      };
      signal.addEventListener('abort', onCancel, { once: true });
    }

    while (!signal?.aborted) {
      if (notYielded === 0) {
        await new Promise((resolve) => callback = resolve);
      }
      for (; notYielded > 0; notYielded--) {
        yield value;
      }
    }
    throw new AbortError();
  } finally {
    // eslint-disable-next-line no-undef
    clearInterval(interval);
    signal?.removeEventListener('abort', onCancel);
  }
}

module.exports = {
  setTimeout,
  setImmediate,
  setInterval,
};
