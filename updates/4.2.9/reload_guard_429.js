(() => {
  "use strict";

  if (window.__VTO_WATCHER_429_RELOAD_GUARD__) return;
  window.__VTO_WATCHER_429_RELOAD_GUARD__ = true;

  const nativeSetTimeout = window.setTimeout.bind(window);
  const fnToString = Function.prototype.toString;

  window.setTimeout = function(handler, delay, ...args) {
    if (typeof handler === "function") {
      let source = "";
      try { source = fnToString.call(handler); } catch (_) {}

      if (/\blocation\.reload\s*\(/.test(source)) {
        return nativeSetTimeout(() => {}, Math.max(0, Number(delay) || 0));
      }
    }

    return nativeSetTimeout(handler, delay, ...args);
  };
})();
