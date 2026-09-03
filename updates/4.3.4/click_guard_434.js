(() => {
  "use strict";

  if (window.__VTO_WATCHER_434_CLICK_GUARD__) return;
  window.__VTO_WATCHER_434_CLICK_GUARD__ = true;

  const nativeAdd = document.addEventListener.bind(document);
  const fnToString = Function.prototype.toString;
  const LAST_ACTION_KEY = "vto434LastActionAt";

  const normalize = text => String(text || "").replace(/\s+/g, " ").trim().toLowerCase();

  function textOf(el) {
    if (!el) return "";
    return normalize(el.innerText || el.textContent || el.value || el.getAttribute?.("aria-label") || el.getAttribute?.("title") || "");
  }

  function hasTimeRange(text) {
    return /\b\d{1,2}:\d{2}\s*(?:am|pm)\s*-\s*\d{1,2}:\d{2}\s*(?:am|pm)\b/i.test(String(text || ""));
  }

  function unavailable(text) {
    const t = normalize(text);
    return [
      "vto filled", "vto full", "opportunity filled", "no longer available",
      "unavailable", "expired", "already accepted", "previously accepted",
      "you accepted", "vto accepted"
    ].some(x => t.includes(x));
  }

  function safeVtoAction(text) {
    const t = normalize(text);
    return t === "accept" || t === "claim" || t === "take vto" || t === "request vto" ||
      t === "confirm" || t.includes("accept vto") || t.includes("claim vto") ||
      t.includes("take vto") || t.includes("request vto") || t.includes("confirm vto") ||
      t.includes("confirm accept") || t.includes("confirm acceptance");
  }

  function genericAction(text) {
    const t = normalize(text);
    return t === "view" || t === "details" || t === "select" || t === "continue" ||
      t === "open" || t === "vto" || t.startsWith("view ") || t.startsWith("details ") ||
      t.startsWith("select ") || t.startsWith("continue ");
  }

  function verifiedLiveOfferAction(clickable) {
    if (!clickable || clickable.closest?.('nav,header,[role="navigation"],[role="menu"]')) return false;
    if (clickable.hasAttribute?.("data-vto-live-offer-action")) return true;

    let current = clickable;
    for (let i = 0; i < 9 && current && current !== document.body; i++) {
      const raw = current.innerText || current.textContent || "";
      if (hasTimeRange(raw) && normalize(raw).length < 2600) {
        return !unavailable(raw);
      }
      current = current.parentElement;
    }
    return false;
  }

  document.addEventListener = function(type, listener, options) {
    if (type === "click" && typeof listener === "function") {
      let source = "";
      try { source = fnToString.call(listener); } catch (_) {}
      const capture = options === true || Boolean(options && typeof options === "object" && options.capture);
      if (capture && source.includes("unsafeGenericAction") && source.includes("data-vto-soft-refresh")) {
        return;
      }
    }
    return nativeAdd(type, listener, options);
  };

  nativeAdd("click", event => {
    if (event.isTrusted) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest("#vto-v4-panel")) return;

    const clickable = target.closest('button,a,[role="button"],[onclick],[tabindex]') || target;
    if (clickable.closest?.('[data-vto-soft-refresh="1"]')) return;

    const text = textOf(clickable);
    if (safeVtoAction(text)) {
      sessionStorage.setItem(LAST_ACTION_KEY, String(Date.now()));
      return;
    }

    if (!genericAction(text)) return;

    if (verifiedLiveOfferAction(clickable)) {
      sessionStorage.setItem(LAST_ACTION_KEY, String(Date.now()));
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
})();
