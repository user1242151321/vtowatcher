(() => {
  "use strict";

  if (window.__VTO_WATCHER_433_RUNTIME_GUARD__) return;
  window.__VTO_WATCHER_433_RUNTIME_GUARD__ = true;

  const nativeSetInterval = window.setInterval.bind(window);
  const fnToString = Function.prototype.toString;

  window.setInterval = function(handler, delay, ...args) {
    if (typeof handler === "function") {
      let source = "";
      try { source = fnToString.call(handler); } catch (_) {}

      if (
        source.includes("runtimeEl") &&
        source.includes("durationText") &&
        source.includes("startedAt")
      ) {
        return nativeSetInterval(() => {}, Math.max(250, Number(delay) || 1000));
      }
    }

    return nativeSetInterval(handler, delay, ...args);
  };
})();
