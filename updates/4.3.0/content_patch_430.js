(() => {
  "use strict";

  if (window.__VTO_WATCHER_430_PATCH__) return;
  window.__VTO_WATCHER_430_PATCH__ = true;

  const normalize = text => String(text || "").replace(/\s+/g, " ").trim().toLowerCase();
  let nextRefreshAt = 0;
  let lastInterval = 0;
  let softRefreshCount = 0;
  let refreshing = false;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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
    return t.includes("voluntary time off") || t.includes("vto filled") || t.includes("vto accepted") || t.includes("accepting voluntary time off");
  }

  function visible(el) {
    if (!el || !(el instanceof Element)) return false;
    const style = getComputedStyle(el); const rect = el.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }

  function navElements() {
    return [...document.querySelectorAll('a[href],button,[role="button"],[role="menuitem"],[role="tab"]')].filter(el => !el.closest?.("#vto-v4-panel"));
  }

  function scoreTarget(el, wanted) {
    const text = textOf(el), href = normalize(el.getAttribute?.("href") || ""), aria = normalize(el.getAttribute?.("aria-label") || ""), title = normalize(el.getAttribute?.("title") || "");
    const navLike = Boolean(el.closest?.('nav,[role="navigation"],[role="menu"],[role="tablist"],header'));
    const role = normalize(el.getAttribute?.("role") || "");
    let matches = false;
    if (wanted === "schedule") matches = text === "schedule" || aria === "schedule" || title === "schedule" || /(^|[\/#?&=_-])schedule([\/#?&=_-]|$)/.test(href);
    else matches = text === "vto" || text.includes("voluntary time off") || aria === "vto" || aria.includes("voluntary time off") || title === "vto" || title.includes("voluntary time off") || /(^|[\/#?&=_-])vto([\/#?&=_-]|$)/.test(href);
    if (!matches || (!navLike && !href && role !== "menuitem" && role !== "tab")) return -1;
    let score = 0; if (visible(el)) score += 8; if (navLike) score += 6; if (href) score += 4; if (role === "menuitem" || role === "tab") score += 3; if (text === wanted) score += 2; return score;
  }

  function findTarget(wanted) {
    return navElements().map(el => ({el,score:scoreTarget(el,wanted)})).filter(x => x.score >= 0).sort((a,b) => b.score-a.score)[0]?.el || null;
  }

  function findMenuButton() {
    return navElements().filter(visible).find(el => { const t=textOf(el), a=normalize(el.getAttribute?.("aria-label")||""), ti=normalize(el.getAttribute?.("title")||""); return t==="menu" || a==="menu" || a.includes("open menu") || ti==="menu" || ti.includes("open menu"); }) || null;
  }

  function clickForRefresh(el) {
    if (!el) return false;
    el.setAttribute("data-vto-soft-refresh","1");
    try { el.click(); return true; }
    finally { setTimeout(() => el.removeAttribute("data-vto-soft-refresh"),100); }
  }

  async function softRefreshVto() {
    if (refreshing || !vtoContext()) return false;
    refreshing = true;
    try {
      let schedule = findTarget("schedule");
      if (!schedule) { const menu=findMenuButton(); if (menu) { clickForRefresh(menu); await sleep(250); schedule=findTarget("schedule"); } }
      if (schedule) { clickForRefresh(schedule); await sleep(350); }
      let vto = findTarget("vto");
      if (!vto) { const menu=findMenuButton(); if (menu) { clickForRefresh(menu); await sleep(250); vto=findTarget("vto"); } }
      if (!vto) { console.warn("[VTO Watcher V4.3.0] Soft refresh could not find VTO navigation."); return false; }
      clickForRefresh(vto); await sleep(650); softRefreshCount++; return true;
    } finally { refreshing=false; }
  }

  function safeVtoAction(text) {
    const t=normalize(text); return t==="accept" || t==="claim" || t==="take vto" || t==="confirm" || t.includes("accept vto") || t.includes("claim vto") || t.includes("take vto") || t.includes("confirm vto") || t.includes("confirm accept") || t.includes("confirm acceptance");
  }

  function unsafeGenericAction(text) {
    const t=normalize(text); return t==="view" || t==="details" || t==="select" || t==="continue" || t==="open" || t==="vto" || t.startsWith("view ") || t.startsWith("details ") || t.startsWith("select ") || t.startsWith("continue ");
  }

  document.addEventListener("click", event => {
    if (event.isTrusted || !vtoContext()) return;
    const target=event.target instanceof Element?event.target:null; if (!target || target.closest("#vto-v4-panel")) return;
    const clickable=target.closest('button,a,[role="button"],[onclick],[tabindex]')||target;
    if (clickable.closest?.('[data-vto-soft-refresh="1"]')) return;
    const text=textOf(clickable); if (safeVtoAction(text) || !unsafeGenericAction(text)) return;
    event.preventDefault(); event.stopImmediatePropagation(); console.warn("[VTO Watcher V4.3.0] Blocked unsafe synthetic navigation click:",text);
  },true);

  function renameCardLabel(strong,label) { const card=strong?.parentElement; if (!card) return; const node=[...card.childNodes].find(n=>n.nodeType===Node.TEXT_NODE); if (node) node.textContent=label; }
  function patchRefreshStat() { const stats=document.getElementById("vto-v4-stats"); if (stats) stats.textContent=stats.textContent.replace(/Refreshes\s+\d+/i,`Refreshes ${softRefreshCount}`); }

  async function maintainRefreshCycle() {
    let state; try { state=await chrome.storage.local.get({armed:false,paused:false,refreshSeconds:5}); } catch (_) { return; }
    const countdown=document.getElementById("vto-v4-countdown"), intervalLabel=document.getElementById("vto-v4-interval-label");
    renameCardLabel(countdown,"Next refresh"); renameCardLabel(intervalLabel,"Refresh interval");
    const seconds=Math.max(5,Number(state.refreshSeconds)||5); if (intervalLabel) intervalLabel.textContent=`${seconds}s`;
    if (!state.armed) { nextRefreshAt=0; lastInterval=seconds; softRefreshCount=0; if (countdown) countdown.textContent="--"; patchRefreshStat(); return; }
    if (state.paused) { nextRefreshAt=0; lastInterval=seconds; if (countdown) countdown.textContent="PAUSED"; patchRefreshStat(); return; }
    const now=Date.now(); if (!nextRefreshAt || lastInterval!==seconds) { lastInterval=seconds; nextRefreshAt=now+seconds*1000; }
    if (now>=nextRefreshAt) { nextRefreshAt=now+seconds*1000; if (vtoContext()) await softRefreshVto(); }
    if (countdown) countdown.textContent=`${Math.max(1,Math.ceil((nextRefreshAt-Date.now())/1000))}s`; patchRefreshStat();
  }

  async function blankPageCheck() {
    let state; try { state=await chrome.storage.local.get({armed:false,paused:false}); } catch (_) { return; }
    if (!state.armed || state.paused || document.readyState!=="complete") return;
    const main=document.querySelector("main,[role='main']"); if (!main) return;
    const rect=main.getBoundingClientRect(), text=normalize(main.innerText||main.textContent||""); if (rect.height<180 || text.length>=30) return;
    const status=document.getElementById("vto-v4-status"); if (status) { status.textContent="A to Z content blank — refresh stopped"; status.style.background="#92400e"; }
    nextRefreshAt=Date.now()+60000;
  }

  setInterval(maintainRefreshCycle,250);
  setInterval(blankPageCheck,1800);
})();
