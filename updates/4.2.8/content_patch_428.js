(() => {
  "use strict";

  if (window.__VTO_WATCHER_428_PATCH__) return;
  window.__VTO_WATCHER_428_PATCH__ = true;

  const BOOT_AT = Date.now();
  const RECOVERY_WINDOW_KEY = "vto4.blankRecoveryWindow";
  const RECOVERY_COUNT_KEY = "vto4.blankRecoveryCount";
  const RECOVERY_COOLDOWN_KEY = "vto4.blankRecoveryAt";
  const normalize = text => String(text || "").replace(/\s+/g, " ").trim().toLowerCase();

  function textOf(el) {
    if (!el) return "";
    return normalize(el.innerText || el.textContent || el.value || el.getAttribute?.("aria-label") || el.getAttribute?.("title") || "");
  }
  function hasTimeRange(text) { return /\b\d{1,2}:\d{2}\s*(?:am|pm)\s*-\s*\d{1,2}:\d{2}\s*(?:am|pm)\b/i.test(text || ""); }
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
  function genericNavigationAction(text) {
    const t = normalize(text);
    return t === "view" || t === "details" || t === "select" || t === "continue" || t === "open" || t === "vto" || t.startsWith("view ") || t.startsWith("details ") || t.startsWith("select ") || t.startsWith("continue ");
  }
  function setPanelStatus(message, type = "warning") {
    const status = document.getElementById("vto-v4-status");
    const panel = document.getElementById("vto-v4-panel");
    if (!status) return;
    const colors = { warning: "#92400e", error: "#991b1b", armed: "#065f46" };
    status.textContent = message;
    status.style.background = colors[type] || colors.warning;
    if (panel) panel.style.borderColor = colors[type] || colors.warning;
  }

  document.addEventListener("click", event => {
    if (event.isTrusted || !vtoContext()) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest("#vto-v4-panel")) return;
    const clickable = target.closest('button,a,[role="button"],[onclick],[tabindex]') || target;
    const text = textOf(clickable);
    if (safeVtoAction(text)) return;
    if (!genericNavigationAction(text) && !hasTimeRange(textOf(clickable))) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    setPanelStatus("Eligible VTO detected — waiting for Accept", "warning");
    console.warn("[VTO Watcher V4.2.8] Blocked unsafe synthetic navigation click:", text || "offer card");
  }, true);

  function meaningfulRoot() {
    const candidates = [...document.querySelectorAll("main,[role='main'],#root,#app")].filter(el => el && !el.closest?.("#vto-v4-panel"));
    if (!candidates.length) return document.body;
    return candidates.map(el => { const r = el.getBoundingClientRect(); return { el, area: Math.max(0, r.width) * Math.max(0, r.height) }; }).sort((a,b) => b.area-a.area)[0]?.el || document.body;
  }
  function blankShellDetected() {
    if (document.readyState !== "complete" || Date.now() - BOOT_AT < 3500) return false;
    const root = meaningfulRoot();
    if (!root) return false;
    const r = root.getBoundingClientRect();
    const text = normalize(root.innerText || root.textContent || "");
    if (location.pathname.toLowerCase().includes("login")) return false;
    if (text.includes("password") || text.includes("sign in") || text.includes("log in")) return false;
    if (text.includes("something went wrong") || text.includes("page unavailable")) return false;
    if (text.includes("voluntary time off")) return false;
    return r.height > 180 && text.length < 35;
  }
  function allowRecovery() {
    const now = Date.now();
    const last = Number(sessionStorage.getItem(RECOVERY_COOLDOWN_KEY) || 0);
    if (last && now-last < 15000) return false;
    let windowStart = Number(sessionStorage.getItem(RECOVERY_WINDOW_KEY) || 0);
    let count = Number(sessionStorage.getItem(RECOVERY_COUNT_KEY) || 0);
    if (!windowStart || now-windowStart > 60000) {
      windowStart = now; count = 0;
      sessionStorage.setItem(RECOVERY_WINDOW_KEY, String(windowStart));
      sessionStorage.setItem(RECOVERY_COUNT_KEY, "0");
    }
    if (count >= 2) return false;
    sessionStorage.setItem(RECOVERY_COOLDOWN_KEY, String(now));
    sessionStorage.setItem(RECOVERY_COUNT_KEY, String(count+1));
    return true;
  }
  function clearRecoveryWindowWhenHealthy() {
    const text = pageText();
    if (text.length > 100 || text.includes("voluntary time off")) {
      sessionStorage.removeItem(RECOVERY_WINDOW_KEY);
      sessionStorage.removeItem(RECOVERY_COUNT_KEY);
    }
  }
  async function recoveryCheck() {
    let state = {};
    try { state = await chrome.storage.local.get({ armed:false, paused:false }); } catch (_) { return; }
    if (!state.armed || state.paused) { clearRecoveryWindowWhenHealthy(); return; }
    if (!blankShellDetected()) { clearRecoveryWindowWhenHealthy(); return; }
    if (!allowRecovery()) { setPanelStatus("A to Z blank page — manual refresh needed", "error"); return; }
    setPanelStatus("Recovering blank A to Z page…", "warning");
    console.warn("[VTO Watcher V4.2.8] Blank A to Z shell detected; reloading once.");
    setTimeout(() => location.reload(), 700);
  }
  setInterval(recoveryCheck, 1500);
  setTimeout(recoveryCheck, 3800);
})();
