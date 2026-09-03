(() => {
  "use strict";

  if (window.__VTO_WATCHER_432_RUNTIME_PATCH__) return;
  window.__VTO_WATCHER_432_RUNTIME_PATCH__ = true;

  const START_KEY = "vto432RuntimeStartedAt";
  let armed = false;
  let startedAt = 0;

  function formatDuration(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = String(Math.floor(total / 3600)).padStart(2, "0");
    const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
    const s = String(total % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
  }

  async function initializeRuntime() {
    try {
      const data = await chrome.storage.local.get({ armed: false, [START_KEY]: 0 });
      armed = Boolean(data.armed);
      startedAt = Number(data[START_KEY] || 0);
      if (armed && !startedAt) {
        startedAt = Date.now();
        await chrome.storage.local.set({ [START_KEY]: startedAt });
      }
      if (!armed && startedAt) {
        startedAt = 0;
        await chrome.storage.local.remove(START_KEY);
      }
    } catch (_) {}
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (changes.armed) {
      const wasArmed = Boolean(changes.armed.oldValue);
      armed = Boolean(changes.armed.newValue);
      if (armed && !wasArmed) {
        startedAt = Date.now();
        chrome.storage.local.set({ [START_KEY]: startedAt }).catch(() => {});
      } else if (!armed) {
        startedAt = 0;
        chrome.storage.local.remove(START_KEY).catch(() => {});
      }
    }
    if (changes[START_KEY]) startedAt = Number(changes[START_KEY].newValue || 0);
  });

  setInterval(() => {
    const runtime = document.getElementById("vto-v4-runtime");
    if (!runtime) return;
    runtime.textContent = armed && startedAt ? formatDuration(Date.now() - startedAt) : "00:00:00";
  }, 200);

  initializeRuntime();
})();
