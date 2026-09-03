(() => {
  "use strict";

  if (window.__VTO_WATCHER_429_PATCH__) return;
  window.__VTO_WATCHER_429_PATCH__ = true;

  const normalize = text => String(text || "").replace(/\s+/g, " ").trim().toLowerCase();

  function textOf(el) {
    if (!el) return "";
    return normalize(el.innerText || el.textContent || el.value || el.getAttribute?.("aria-label") || el.getAttribute?.("title") || "");
  }

  function pageText() {
    const root = document.querySelector("main,[role='main'],#root,#app") || document.body;
    return normalize(root?.innerText || root?.textContent || "");
  }

  function vtoContext() {
    const t = pageText();
    return t.includes("voluntary time off") || t.includes("vto filled") || t.includes("vto accepted");
  }

  function safeVtoAction(text) {
    const t = normalize(text);
    return t === "accept" || t === "claim" || t === "take vto" || t === "confirm" || t.includes("accept vto") || t.includes("claim vto") || t.includes("take vto") || t.includes("confirm vto") || t.includes("confirm accept") || t.includes("confirm acceptance");
  }

  function unsafeGenericAction(text) {
    const t = normalize(text);
    return t === "view" || t === "details" || t === "select" || t === "continue" || t === "open" || t === "vto" || t.startsWith("view ") || t.startsWith("details ") || t.startsWith("select ") || t.startsWith("continue ");
  }

  document.addEventListener("click", event => {
    if (event.isTrusted || !vtoContext()) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest("#vto-v4-panel")) return;
    const clickable = target.closest('button,a,[role="button"],[onclick],[tabindex]') || target;
    const text = textOf(clickable);
    if (safeVtoAction(text) || !unsafeGenericAction(text)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    console.warn("[VTO Watcher V4.2.9] Blocked generic synthetic navigation click:", text);
  }, true);

  setInterval(async () => {
    let state;
    try { state = await chrome.storage.local.get({ armed: false, paused: false }); } catch (_) { return; }
    if (!state.armed || state.paused || document.readyState !== "complete") return;
    const main = document.querySelector("main,[role='main']");
    if (!main) return;
    const rect = main.getBoundingClientRect();
    const text = normalize(main.innerText || main.textContent || "");
    if (rect.height < 180 || text.length >= 30) return;
    const status = document.getElementById("vto-v4-status");
    if (status) {
      status.textContent = "A to Z content blank — auto reload blocked";
      status.style.background = "#92400e";
    }
  }, 1800);
})();
