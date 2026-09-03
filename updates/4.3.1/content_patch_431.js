(() => {
  "use strict";

  if (window.__VTO_WATCHER_431_PATCH__) return;
  window.__VTO_WATCHER_431_PATCH__ = true;

  const normalize = text => String(text || "").replace(/\s+/g, " ").trim().toLowerCase();
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  let nextRefreshAt = 0;
  let lastInterval = 0;
  let softRefreshCount = 0;
  let refreshing = false;

  function textOf(el) { if (!el) return ""; return normalize(el.innerText || el.textContent || el.value || el.getAttribute?.("aria-label") || el.getAttribute?.("title") || ""); }
  function visible(el) { if (!el || !(el instanceof Element)) return false; const s=getComputedStyle(el),r=el.getBoundingClientRect(); return s.display!=="none"&&s.visibility!=="hidden"&&Number(s.opacity||1)>0&&r.width>0&&r.height>0; }
  function pageText() { const root=document.querySelector("main,[role='main'],#root,#app")||document.body; return normalize(root?.innerText||root?.textContent||""); }
  function isVtoContext() { const t=pageText(); return location.pathname.toLowerCase().includes("voluntary_time_off") || t.includes("voluntary time off") || t.includes("vto filled") || t.includes("vto accepted") || t.includes("accepting voluntary time off"); }
  function allClickables() { return [...document.querySelectorAll('button,a[href],[role="button"],[role="menuitem"],[role="tab"],[tabindex]')].filter(el=>!el.closest?.("#vto-v4-panel")); }
  function markAndClick(el) { if (!el||!visible(el)) return false; el.setAttribute("data-vto-soft-refresh","1"); try{el.click();return true;}finally{setTimeout(()=>el.removeAttribute("data-vto-soft-refresh"),250);} }

  function findMenuButton() {
    const visibleEls=allClickables().filter(visible);
    const labeled=visibleEls.find(el=>{const t=textOf(el),a=normalize(el.getAttribute?.("aria-label")||""),ti=normalize(el.getAttribute?.("title")||"");return t==="menu"||t.includes("menu")||a==="menu"||a.includes("menu")||ti==="menu"||ti.includes("menu");});
    if (labeled) return labeled;
    return visibleEls.map(el=>({el,r:el.getBoundingClientRect()})).filter(x=>x.r.top>=0&&x.r.top<95&&x.r.left>=0&&x.r.left<95&&x.r.width<=80&&x.r.height<=80).sort((a,b)=>(a.r.left+a.r.top)-(b.r.left+b.r.top))[0]?.el||null;
  }

  function findTextTarget(kind) {
    const scored=[];
    for (const el of allClickables().filter(visible)) {
      const t=textOf(el),href=normalize(el.getAttribute?.("href")||""),aria=normalize(el.getAttribute?.("aria-label")||""),title=normalize(el.getAttribute?.("title")||"");
      let match=false;
      if (kind==="schedule") match=t==="schedule"||t.startsWith("schedule ")||aria.includes("schedule")||title.includes("schedule")||href.includes("schedule");
      else match=t==="vto"||t.includes("voluntary time off")||aria==="vto"||aria.includes("voluntary time off")||title==="vto"||title.includes("voluntary time off")||href.includes("voluntary_time_off");
      if (!match) continue;
      const r=el.getBoundingClientRect(); let score=0;
      if (el.closest?.('nav,[role="navigation"],[role="menu"],[role="menuitem"]')) score+=10;
      if (href) score+=5;
      if (kind==="schedule"&&t==="schedule") score+=5;
      if (kind==="vto"&&(t==="vto"||t.includes("voluntary time off"))) score+=5;
      if (r.left<window.innerWidth*0.45) score+=2;
      scored.push({el,score});
    }
    return scored.sort((a,b)=>b.score-a.score)[0]?.el||null;
  }

  async function openMenuAndFind(kind) {
    let target=findTextTarget(kind); if (target) return target;
    const menu=findMenuButton(); if (!menu||!markAndClick(menu)) return null;
    for (const wait of [180,250,350,500]) { await sleep(wait); target=findTextTarget(kind); if (target) return target; }
    return null;
  }

  async function softRefreshVto() {
    if (refreshing||!isVtoContext()) return false;
    refreshing=true;
    try {
      const schedule=await openMenuAndFind("schedule"); if (!schedule||!markAndClick(schedule)) return false;
      await sleep(500);
      const vto=await openMenuAndFind("vto"); if (!vto||!markAndClick(vto)) return false;
      await sleep(700); softRefreshCount++; return true;
    } finally { refreshing=false; }
  }

  function safeVtoAction(text) { const t=normalize(text); return t==="accept"||t==="claim"||t==="take vto"||t==="confirm"||t.includes("accept vto")||t.includes("claim vto")||t.includes("take vto")||t.includes("confirm vto")||t.includes("confirm accept")||t.includes("confirm acceptance"); }
  function unsafeGenericAction(text) { const t=normalize(text); return t==="view"||t==="details"||t==="select"||t==="continue"||t==="open"||t==="vto"||t.startsWith("view ")||t.startsWith("details ")||t.startsWith("select ")||t.startsWith("continue "); }

  document.addEventListener("click",event=>{ if(event.isTrusted||!isVtoContext())return; const target=event.target instanceof Element?event.target:null; if(!target||target.closest("#vto-v4-panel"))return; const clickable=target.closest('button,a,[role="button"],[onclick],[tabindex]')||target; if(clickable.closest?.('[data-vto-soft-refresh="1"]'))return; const text=textOf(clickable); if(safeVtoAction(text)||!unsafeGenericAction(text))return; event.preventDefault(); event.stopImmediatePropagation(); },true);

  function renameCardLabel(strong,label){const card=strong?.parentElement;if(!card)return;const node=[...card.childNodes].find(n=>n.nodeType===Node.TEXT_NODE);if(node)node.textContent=label;}
  function patchRefreshStat(){const stats=document.getElementById("vto-v4-stats");if(stats)stats.textContent=stats.textContent.replace(/Refreshes\s+\d+/i,`Refreshes ${softRefreshCount}`);}

  async function maintainRefreshCycle(){let state;try{state=await chrome.storage.local.get({armed:false,paused:false,refreshSeconds:5});}catch(_){return;}const countdown=document.getElementById("vto-v4-countdown"),intervalLabel=document.getElementById("vto-v4-interval-label");renameCardLabel(countdown,"Next refresh");renameCardLabel(intervalLabel,"Refresh interval");const seconds=Math.max(5,Number(state.refreshSeconds)||5);if(intervalLabel)intervalLabel.textContent=`${seconds}s`;if(!state.armed){nextRefreshAt=0;lastInterval=seconds;softRefreshCount=0;if(countdown)countdown.textContent="--";patchRefreshStat();return;}if(state.paused){nextRefreshAt=0;lastInterval=seconds;if(countdown)countdown.textContent="PAUSED";patchRefreshStat();return;}const now=Date.now();if(!nextRefreshAt||lastInterval!==seconds){lastInterval=seconds;nextRefreshAt=now+seconds*1000;}if(now>=nextRefreshAt){nextRefreshAt=now+seconds*1000;if(isVtoContext())await softRefreshVto();}if(countdown)countdown.textContent=`${Math.max(1,Math.ceil((nextRefreshAt-Date.now())/1000))}s`;patchRefreshStat();}

  async function blankPageCheck(){let state;try{state=await chrome.storage.local.get({armed:false,paused:false});}catch(_){return;}if(!state.armed||state.paused||document.readyState!=="complete")return;const main=document.querySelector("main,[role='main']");if(!main)return;const r=main.getBoundingClientRect(),text=normalize(main.innerText||main.textContent||"");if(r.height<180||text.length>=30)return;const status=document.getElementById("vto-v4-status");if(status){status.textContent="A to Z content blank — refresh stopped";status.style.background="#92400e";}nextRefreshAt=Date.now()+60000;}

  setInterval(maintainRefreshCycle,250);
  setInterval(blankPageCheck,1800);
})();
