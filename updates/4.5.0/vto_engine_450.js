(() => {
  "use strict";
  if (window.__VTO_WATCHER_450__) return;
  window.__VTO_WATCHER_450__ = true;

  const VERSION = chrome.runtime.getManifest().version;
  const DEFAULTS = {
    armed:false, paused:false, refreshSeconds:5, autoConfirm:false, testMode:false,
    soundEnabled:true, notificationsEnabled:true, tabFlashEnabled:true,
    minHours:0, startAfter:"any", preferLongest:true, maxAcceptsPerArm:1,
    acceptedThisArm:0, panelX:null, panelY:null, panelMinimized:false,
    armedStartedAt:0
  };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const norm = s => String(s || "").replace(/\s+/g," ").trim().toLowerCase();
  const visible = el => {
    if (!el || !(el instanceof Element)) return false;
    const s=getComputedStyle(el), r=el.getBoundingClientRect();
    return s.display!=="none" && s.visibility!=="hidden" && Number(s.opacity||1)>0 && r.width>0 && r.height>0;
  };
  const textOf = el => norm(el?.innerText || el?.textContent || el?.value || el?.getAttribute?.("aria-label") || el?.getAttribute?.("title") || "");
  const clickables = (root=document) => [...root.querySelectorAll('button,a[href],[role="button"],[role="menuitem"],[role="tab"],input[type="button"],input[type="submit"],[tabindex]')].filter(visible).filter(el=>!el.closest?.("#vto-v4-panel"));
  const bodyText = () => norm((document.querySelector("main,[role='main'],#root,#app") || document.body)?.innerText || document.body?.innerText || "");
  const nowText = () => new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"});
  const duration = ms => { const t=Math.max(0,Math.floor(ms/1000)); return `${String(Math.floor(t/3600)).padStart(2,"0")}:${String(Math.floor((t%3600)/60)).padStart(2,"0")}:${String(t%60).padStart(2,"0")}`; };

  let state={...DEFAULTS}, panel, ui={}, logs=[], stats={checks:0,refreshes:0,found:0,old:0,errors:0};
  let scanning=false, acting=false, refreshing=false, nextRefreshAt=0, refreshHoldUntil=0, lastActionAt=0, lastNoticeAt=0, pendingActionAt=0;
  let originalTitle=document.title, flashTimer=null, observerTimer=null;

  async function save(patch){ state={...state,...patch}; await chrome.storage.local.set(patch); }
  function log(step, detail=""){
    const entry={time:nowText(),step,detail:String(detail||"")}; logs.unshift(entry); if(logs.length>80) logs.length=80;
    renderLog();
  }
  function setStatus(message,type="off"){
    if(!ui.status) return;
    ui.status.textContent=message;
    ui.status.dataset.state=type;
  }
  function isVtoContext(){ const t=bodyText(); return location.pathname.toLowerCase().includes("voluntary_time_off") || t.includes("voluntary time off") || t.includes("accepting voluntary time off") || t.includes("vto filled") || t.includes("vto accepted"); }
  function isLogin(){ const t=bodyText(); return location.pathname.includes("login") || (t.includes("password")&&(t.includes("log in")||t.includes("sign in"))); }
  function isPageError(){ const t=bodyText(); return ["something went wrong","try again later","unexpected error","page unavailable"].some(x=>t.includes(x)); }
  function unavailable(text){ const t=norm(text); return ["vto filled","vto full","opportunity filled","no longer available","unavailable","expired","already accepted","previously accepted","you accepted","vto accepted"].some(x=>t.includes(x)); }
  function hasRange(text){ return /\b\d{1,2}:\d{2}\s*(?:am|pm)\s*-\s*\d{1,2}:\d{2}\s*(?:am|pm)\b/i.test(String(text||"")); }
  function clockMinutes(raw){ const m=String(raw||"").match(/(\d{1,2}):(\d{2})\s*(am|pm)/i); if(!m)return null; let h=+m[1],n=+m[2]; if(h===12)h=0; if(m[3].toLowerCase()==="pm")h+=12; return h*60+n; }
  function rangeInfo(text){ const m=String(text||"").match(/(\d{1,2}:\d{2}\s*(?:am|pm))\s*-\s*(\d{1,2}:\d{2}\s*(?:am|pm))/i); if(!m)return null; const start=clockMinutes(m[1]); let end=clockMinutes(m[2]); if(start==null||end==null)return null; if(end<=start)end+=1440; return {startText:m[1],endText:m[2],startMinutes:start,hours:(end-start)/60}; }
  function parseHours(text){ const h=String(text||"").match(/(\d+(?:\.\d+)?)\s*hrs?/i), m=String(text||"").match(/(\d+)\s*mins?/i); let v=0; if(h)v+=+h[1]; if(m)v+=+m[1]/60; return v||rangeInfo(text)?.hours||0; }
  function inferLocation(text){ return String(text||"").split(/\n+/).map(x=>x.trim()).filter(Boolean).find(x=>x.length<80&&!/vto|voluntary|filled|accepted|\d{1,2}:\d{2}|hrs?|mins?|confirm|accept|claim/i.test(x))||""; }
  function expandCard(seed){ let cur=seed,best=seed; for(let i=0;i<9&&cur&&cur!==document.body;i++){ const raw=cur.innerText||""; if(hasRange(raw)&&norm(raw).length<2600) best=cur; const acts=clickables(cur); if(hasRange(raw)&&(unavailable(raw)||acts.some(a=>/accept|claim|request|select|continue|view|details|open/i.test(textOf(a))))) return cur; cur=cur.parentElement; } return best; }
  function offers(){
    if(!isVtoContext()) return [];
    const seeds=[...document.querySelectorAll("div,section,article,li")].filter(visible).filter(el=>hasRange(el.innerText||"")&&norm(el.innerText||"").length<2600).filter(el=>![...el.children].some(c=>hasRange(c.innerText||"")));
    return [...new Set(seeds.map(expandCard).filter(Boolean))].map(card=>{ const raw=card.innerText||"", r=rangeInfo(raw); return {card,raw,startText:r?.startText||"",endText:r?.endText||"",startMinutes:r?.startMinutes??null,hours:parseHours(raw),location:inferLocation(raw),unavailable:unavailable(raw)}; });
  }
  function eligible(){ let list=offers().filter(o=>!o.unavailable).filter(o=>Number(state.minHours||0)<=0||o.hours>=Number(state.minHours||0)).filter(o=>state.startAfter==="any"||o.startMinutes==null||o.startMinutes>=Number(state.startAfter)); if(state.preferLongest) list.sort((a,b)=>(b.hours||0)-(a.hours||0)); return list; }
  function describe(o){ if(!o)return "No eligible VTO currently detected."; return [o.startText&&o.endText?`${o.startText} – ${o.endText}`:"",o.hours?`${o.hours.toFixed(2).replace(/\.00$/,"")} hr`:"",o.location].filter(Boolean).join(" • "); }
  function actionFor(card){
    const acts=clickables(card);
    const direct=["accept","claim","take vto","request vto","get vto","request"];
    let el=acts.find(x=>direct.some(k=>{const t=textOf(x);return t===k||t.includes(k);}));
    if(el)return {el,label:textOf(el)};
    const openers=["select","continue","view","details","open"];
    el=acts.find(x=>openers.some(k=>{const t=textOf(x);return t===k||t.startsWith(k+" ");}));
    return el?{el,label:textOf(el)}:null;
  }
  function confirmButton(){ return clickables().find(el=>{const t=textOf(el); return t==="confirm"||t==="confirm vto"||t.includes("confirm accept")||t.includes("confirm acceptance")||t==="yes, accept"||t==="yes accept";})||null; }
  function successDetected(){ const t=bodyText(); return ["successfully accepted","successfully claimed","acceptance confirmed","you have accepted this vto","vto has been accepted"].some(x=>t.includes(x)); }

  function beep(freq=800,d=0.1){ if(!state.soundEnabled)return; try{const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;const c=new AC(),o=c.createOscillator(),g=c.createGain();o.frequency.value=freq;g.gain.value=.04;o.connect(g);g.connect(c.destination);o.start();setTimeout(()=>{o.stop();c.close();},d*1000);}catch(_){} }
  function notify(title,message){ if(state.notificationsEnabled) chrome.runtime.sendMessage({type:"notify",title,message}).catch(()=>{}); }
  function flash(text="VTO FOUND — VTO Watcher"){ if(!state.tabFlashEnabled||flashTimer)return; originalTitle=document.title; let on=false; flashTimer=setInterval(()=>{on=!on;document.title=on?text:originalTitle;},650); setTimeout(stopFlash,12000); }
  function stopFlash(){ if(flashTimer)clearInterval(flashTimer);flashTimer=null;document.title=originalTitle; }
  function alertFound(o){ const n=Date.now();if(n-lastNoticeAt<5000)return;lastNoticeAt=n;beep(760,.09);setTimeout(()=>beep(980,.12),130);notify("VTO FOUND",describe(o));flash(); }

  async function clickVerified(el,stage){
    if(!el||!visible(el)||acting)return false;
    if(Date.now()-lastActionAt<900)return false;
    lastActionAt=Date.now();
    log(stage,"button="+textOf(el));
    if(state.testMode){setStatus(`TEST MODE — would ${stage}`,"warning");return false;}
    acting=true;
    try{ el.setAttribute("data-vto-engine-action","1"); el.scrollIntoView({block:"center",behavior:"auto"}); await sleep(120); el.click(); pendingActionAt=Date.now(); await sleep(650); return true; }
    catch(e){stats.errors++;log("CLICK ERROR",e?.message||e);setStatus("Action click failed","error");return false;}
    finally{try{el.removeAttribute("data-vto-engine-action");}catch(_){}acting=false;renderStats();}
  }

  async function scan(){
    if(scanning||!state.armed||state.paused)return; scanning=true;
    try{
      stats.checks++; if(ui.last)ui.last.textContent=nowText(); renderStats();
      if(isLogin()){setStatus("Login required","error");log("STOP","Amazon login required");notify("VTO Watcher","Amazon A to Z needs you to log in again.");return;}
      if(isPageError()){stats.errors++;setStatus("A to Z page error","error");log("PAGE ERROR","A to Z reported an error");renderStats();return;}
      if(!isVtoContext()){setStatus("Open Schedule → VTO","warning");if(ui.offer)ui.offer.textContent="No eligible VTO currently detected.";return;}
      if(state.acceptedThisArm>=Number(state.maxAcceptsPerArm||1)){await disarm("Maximum VTO accepted");return;}
      if(successDetected()&&pendingActionAt){ const accepted=state.acceptedThisArm+1; await save({acceptedThisArm:accepted}); log("ACCEPT VERIFIED","Fresh success message detected"); setStatus("VTO ACCEPTED!","success");notify("VTO ACCEPTED","Your VTO appears to have been accepted.");beep(1050,.12);setTimeout(()=>beep(1280,.15),150);setTimeout(()=>disarm("VTO accepted"),700);return; }
      const confirm=confirmButton();
      if(confirm){ log("CONFIRM DETECTED",`autoConfirm=${state.autoConfirm} testMode=${state.testMode}`); if(state.testMode){setStatus("TEST MODE — confirmation detected","warning");return;} if(!state.autoConfirm){setStatus("VTO ready — Auto Confirm OFF","found");notify("VTO READY","Final VTO confirmation is waiting.");return;} setStatus("Confirming VTO…","found"); await clickVerified(confirm,"CONFIRM CLICK"); return; }
      const list=eligible(), best=list[0]||null; if(ui.offer)ui.offer.textContent=describe(best);
      const old=offers().filter(o=>o.unavailable).length;
      if(!best){ if(old){stats.old=Math.max(stats.old,old);setStatus(`Watching — ${old} filled/old`,"armed");}else setStatus("Watching for VTO","armed");renderStats();return; }
      stats.found++; renderStats(); alertFound(best); log("OFFER FOUND",describe(best));
      const action=actionFor(best.card);
      if(!action){setStatus("VTO FOUND — action not recognized","warning");log("ACTION MISSING","No verified button found inside eligible offer card");return;}
      setStatus("VTO FOUND — opening offer…","found"); await clickVerified(action.el,"OFFER ACTION");
    } finally {scanning=false;}
  }

  function menuButton(){ const list=clickables(); const named=list.find(el=>{const t=textOf(el),a=norm(el.getAttribute?.("aria-label")||"");return t==="menu"||t.includes("menu")||a.includes("menu");}); if(named)return named; return list.map(el=>({el,r:el.getBoundingClientRect()})).filter(x=>x.r.top>=0&&x.r.top<100&&x.r.left>=0&&x.r.left<100&&x.r.width<=85&&x.r.height<=85).sort((a,b)=>(a.r.left+a.r.top)-(b.r.left+b.r.top))[0]?.el||null; }
  function navTarget(kind){ const list=clickables(); const scored=[]; for(const el of list){const t=textOf(el),h=norm(el.getAttribute?.("href")||""),a=norm(el.getAttribute?.("aria-label")||""); let ok=kind==="schedule"?(t==="schedule"||t.startsWith("schedule ")||a.includes("schedule")||h.includes("schedule")):(t==="vto"||t.includes("voluntary time off")||a==="vto"||a.includes("voluntary time off")||h.includes("voluntary_time_off")); if(!ok)continue; let score=0;if(el.closest?.('nav,[role="navigation"],[role="menu"]'))score+=10;if(h)score+=4;if(t===(kind==="schedule"?"schedule":"vto"))score+=4;scored.push({el,score});} return scored.sort((a,b)=>b.score-a.score)[0]?.el||null; }
  async function findNav(kind){ let t=navTarget(kind);if(t)return t;const m=menuButton();if(!m)return null;m.setAttribute("data-vto-soft-nav","1");m.click();await sleep(300);m.removeAttribute("data-vto-soft-nav");return navTarget(kind); }
  async function softRefresh(){
    if(refreshing||!state.armed||state.paused||Date.now()<refreshHoldUntil)return false;
    if(!isVtoContext())return false;
    refreshing=true; setStatus("Refreshing VTO…","armed"); log("REFRESH START","soft Schedule → VTO navigation");
    try{
      let schedule=await findNav("schedule");
      if(schedule){schedule.setAttribute("data-vto-soft-nav","1");schedule.click();await sleep(450);schedule.removeAttribute("data-vto-soft-nav");}
      let vto=await findNav("vto");
      if(!vto){stats.errors++;log("REFRESH SKIPPED","VTO navigation not found");setStatus("Refresh skipped — VTO menu not found","warning");return false;}
      vto.setAttribute("data-vto-soft-nav","1");vto.click();await sleep(650);vto.removeAttribute("data-vto-soft-nav");stats.refreshes++;log("REFRESH COMPLETE","VTO view reopened");renderStats();return true;
    } catch(e){stats.errors++;log("REFRESH ERROR",e?.message||e);setStatus("Refresh failed — watcher still scanning","warning");return false;}
    finally{refreshing=false;nextRefreshAt=Date.now()+Math.max(5,Number(state.refreshSeconds)||5)*1000;}
  }
  function blankGuard(){ if(!state.armed||state.paused||document.readyState!=="complete")return;const main=document.querySelector("main,[role='main']");if(!main)return;const r=main.getBoundingClientRect(),t=norm(main.innerText||main.textContent||"");if(r.height>=180&&t.length<25){refreshHoldUntil=Date.now()+60000;nextRefreshAt=refreshHoldUntil;setStatus("A to Z content blank — auto refresh paused","warning");log("BLANK GUARD","Refresh paused for 60s; no forced page reload");} }

  async function arm(){ const lic=await window.VTOLicense.requireValid(true);if(!lic?.valid){setStatus("License inactive","error");log("ARM BLOCKED","License inactive");return;} stats={checks:0,refreshes:0,found:0,old:0,errors:0};logs=[];pendingActionAt=0;const started=Date.now();await save({armed:true,paused:false,acceptedThisArm:0,armedStartedAt:started});nextRefreshAt=started+Math.max(5,Number(state.refreshSeconds)||5)*1000;setStatus("ARMED — watching","armed");log("ARMED",`v${VERSION}`);beep(650,.08);renderAll();scan(); }
  async function disarm(reason="Disarmed"){stopFlash();await save({armed:false,paused:false,armedStartedAt:0});nextRefreshAt=0;refreshHoldUntil=0;setStatus(reason,"off");log("DISARMED",reason);renderAll();}
  async function togglePause(){if(!state.armed)return;await save({paused:!state.paused});if(state.paused){setStatus("PAUSED","warning");log("PAUSED");}else{nextRefreshAt=Date.now()+Math.max(5,Number(state.refreshSeconds)||5)*1000;setStatus("ARMED — watching","armed");log("RESUMED");scan();}renderAll();}

  function renderStats(){if(ui.stats)ui.stats.textContent=`Checks ${stats.checks} • Refreshes ${stats.refreshes} • Found ${stats.found} • Old ${stats.old} • Errors ${stats.errors} • Accepted ${state.acceptedThisArm}/1`;}
  function renderLog(){if(!ui.log)return;if(!logs.length){ui.log.innerHTML='<div class="vto-empty">No activity yet</div>';return;}ui.log.innerHTML=logs.slice(0,18).map(x=>`<div class="vto-log-entry"><b>${esc(x.time)}</b> <span>${esc(x.step)}</span>${x.detail?`<small>${esc(x.detail)}</small>`:""}</div>`).join("");}
  const esc=s=>String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  function toggle(btn,on,label){if(!btn)return;btn.classList.toggle("on",!!on);btn.textContent=`${label}: ${on?"ON":"OFF"}`;}
  function renderAll(){ if(!panel)return;ui.arm.textContent=state.armed?"DISARM VTO":"ARM VTO";ui.arm.classList.toggle("disarm",state.armed);ui.pause.textContent=state.paused?"RESUME":"PAUSE";ui.pause.disabled=!state.armed;toggle(ui.auto,state.autoConfirm,"Auto Confirm");toggle(ui.test,state.testMode,"Test Mode");toggle(ui.sound,state.soundEnabled,"Sound");toggle(ui.notify,state.notificationsEnabled,"Notify");toggle(ui.flash,state.tabFlashEnabled,"Tab Flash");toggle(ui.longest,state.preferLongest,"Prefer Longest");ui.refresh.value=String(Math.max(5,Number(state.refreshSeconds)||5));ui.min.value=String(state.minHours??0);ui.after.value=String(state.startAfter??"any");ui.interval.textContent=`${Math.max(5,Number(state.refreshSeconds)||5)}s`;panel.classList.toggle("vto-minimized",!!state.panelMinimized);renderStats();renderLog(); }

  async function copyDiagnostics(){ const header=[`VTO Watcher v${VERSION}`,`URL: ${location.href}`,`armed=${state.armed} paused=${state.paused} autoConfirm=${state.autoConfirm} testMode=${state.testMode}`,`refresh=${state.refreshSeconds}s minHours=${state.minHours} startAfter=${state.startAfter} preferLongest=${state.preferLongest}`,`stats: ${JSON.stringify(stats)}`,"--- activity ---"]; const body=logs.slice().reverse().map(x=>`${x.time} | ${x.step}${x.detail?` | ${x.detail}`:""}`);try{await navigator.clipboard.writeText([...header,...body].join("\n"));log("DIAGNOSTICS COPIED");}catch(e){log("COPY FAILED",e?.message||e);} }

  function buildPanel(){
    if(document.getElementById("vto-v4-panel")){panel=document.getElementById("vto-v4-panel");return;}
    panel=document.createElement("div");panel.id="vto-v4-panel";panel.innerHTML=`
      <div class="vto-v4-header" id="vto-v4-drag"><div class="vto-v4-title"><span class="vto-v4-badge">V${VERSION.split('.').slice(0,2).join('.')}</span></div><div class="vto-v4-header-actions"><button class="vto-icon-btn" id="vto-v4-min">—</button></div></div>
      <div class="vto-v4-body"><div class="vto-status" id="vto-v4-status">Loading…</div>
      <div class="vto-grid-2"><div class="vto-card">Next refresh<strong id="vto-v4-countdown">--</strong></div><div class="vto-card">Last check<strong id="vto-v4-lastcheck">--</strong></div><div class="vto-card">Runtime<strong id="vto-v4-runtime">00:00:00</strong></div><div class="vto-card">Refresh interval<strong id="vto-v4-interval-label">5s</strong></div></div>
      <div class="vto-section"><div class="vto-section-title">Best eligible VTO</div><div class="vto-offer-box" id="vto-v4-offer">No eligible VTO currently detected.</div></div>
      <div class="vto-section"><div class="vto-section-title">Filters</div><div class="vto-grid-2"><div><label>Minimum hours</label><input class="vto-number" id="vto-v4-min-hours" type="number" min="0" max="24" step="0.25"></div><div><label>Start after</label><select class="vto-select" id="vto-v4-start-after"><option value="any">Any time</option><option value="720">12:00 PM</option><option value="840">2:00 PM</option><option value="960">4:00 PM</option><option value="1080">6:00 PM</option><option value="1200">8:00 PM</option></select></div></div><button class="vto-toggle" id="vto-v4-longest">Prefer Longest</button></div>
      <div class="vto-section"><div class="vto-section-title">Watcher</div><div class="vto-grid-2"><select class="vto-select" id="vto-v4-refresh"><option value="5">5 seconds</option><option value="10">10 seconds</option><option value="15">15 seconds</option><option value="20">20 seconds</option><option value="30">30 seconds</option><option value="60">60 seconds</option></select><button class="vto-secondary" id="vto-v4-scan">Scan now</button></div><div class="vto-grid-2 vto-controls"><button class="vto-toggle" id="vto-v4-auto"></button><button class="vto-toggle" id="vto-v4-test"></button><button class="vto-toggle" id="vto-v4-sound"></button><button class="vto-toggle" id="vto-v4-notify"></button><button class="vto-toggle" id="vto-v4-flash"></button><button class="vto-secondary" id="vto-v4-pause">PAUSE</button></div><button class="vto-main" id="vto-v4-arm">ARM VTO</button></div>
      <div class="vto-section"><div class="vto-section-title" id="vto-v4-stats">Stats</div><div class="vto-grid-2"><button class="vto-secondary" id="vto-v4-copy">Copy Diagnostics</button><button class="vto-secondary" id="vto-v4-clear">Clear Log</button></div><div class="vto-log" id="vto-v4-activity"></div></div><div class="vto-footer">VTO only • verified offer-card actions • max 1 new VTO per arm</div></div>`;
    document.documentElement.appendChild(panel);
    const $=id=>panel.querySelector(id);ui={status:$("#vto-v4-status"),countdown:$("#vto-v4-countdown"),last:$("#vto-v4-lastcheck"),runtime:$("#vto-v4-runtime"),interval:$("#vto-v4-interval-label"),offer:$("#vto-v4-offer"),stats:$("#vto-v4-stats"),log:$("#vto-v4-activity"),arm:$("#vto-v4-arm"),pause:$("#vto-v4-pause"),auto:$("#vto-v4-auto"),test:$("#vto-v4-test"),sound:$("#vto-v4-sound"),notify:$("#vto-v4-notify"),flash:$("#vto-v4-flash"),longest:$("#vto-v4-longest"),refresh:$("#vto-v4-refresh"),min:$("#vto-v4-min-hours"),after:$("#vto-v4-start-after")};
    ui.arm.onclick=()=>state.armed?disarm():arm();ui.pause.onclick=togglePause;$("#vto-v4-scan").onclick=()=>{log("MANUAL SCAN");scan();};ui.auto.onclick=async()=>{await save({autoConfirm:!state.autoConfirm});renderAll();scan();};ui.test.onclick=async()=>{await save({testMode:!state.testMode});log("TEST MODE",state.testMode?"ON":"OFF");renderAll();};ui.sound.onclick=async()=>{await save({soundEnabled:!state.soundEnabled});renderAll();if(state.soundEnabled)beep();};ui.notify.onclick=async()=>{await save({notificationsEnabled:!state.notificationsEnabled});renderAll();};ui.flash.onclick=async()=>{await save({tabFlashEnabled:!state.tabFlashEnabled});if(!state.tabFlashEnabled)stopFlash();renderAll();};ui.longest.onclick=async()=>{await save({preferLongest:!state.preferLongest});renderAll();scan();};ui.refresh.onchange=async()=>{const n=Math.max(5,+ui.refresh.value||5);await save({refreshSeconds:n});nextRefreshAt=Date.now()+n*1000;log("REFRESH INTERVAL",`${n}s`);renderAll();};ui.min.onchange=async()=>{await save({minHours:Math.max(0,+ui.min.value||0)});renderAll();scan();};ui.after.onchange=async()=>{await save({startAfter:ui.after.value});renderAll();scan();};$("#vto-v4-copy").onclick=copyDiagnostics;$("#vto-v4-clear").onclick=()=>{logs=[];renderLog();};$("#vto-v4-min").onclick=async()=>{await save({panelMinimized:!state.panelMinimized});renderAll();};
    makeDraggable(panel,$("#vto-v4-drag"));if(state.panelX!=null&&state.panelY!=null){panel.style.left=`${state.panelX}px`;panel.style.top=`${state.panelY}px`;panel.style.right="auto";panel.style.bottom="auto";}renderAll();
  }
  function makeDraggable(box,handle){let drag=false,dx=0,dy=0;handle.addEventListener("mousedown",e=>{if(e.target.closest("button"))return;drag=true;const r=box.getBoundingClientRect();dx=e.clientX-r.left;dy=e.clientY-r.top;e.preventDefault();});document.addEventListener("mousemove",e=>{if(!drag)return;const x=Math.max(8,Math.min(window.innerWidth-box.offsetWidth-8,e.clientX-dx)),y=Math.max(8,Math.min(window.innerHeight-44,e.clientY-dy));box.style.left=`${x}px`;box.style.top=`${y}px`;box.style.right="auto";box.style.bottom="auto";});document.addEventListener("mouseup",async()=>{if(!drag)return;drag=false;const r=box.getBoundingClientRect();await save({panelX:Math.round(r.left),panelY:Math.round(r.top)});});}

  function heartbeat(){
    if(!panel)buildPanel();
    if(ui.runtime)ui.runtime.textContent=state.armed&&state.armedStartedAt?duration(Date.now()-Number(state.armedStartedAt)):"00:00:00";
    if(ui.countdown){if(!state.armed)ui.countdown.textContent="--";else if(state.paused)ui.countdown.textContent="PAUSED";else ui.countdown.textContent=`${Math.max(1,Math.ceil((nextRefreshAt-Date.now())/1000))}s`;}
    if(state.armed&&!state.paused&&Date.now()>=nextRefreshAt&&!refreshing)softRefresh();
  }
  chrome.storage.onChanged.addListener((changes,area)=>{if(area!=="local")return;for(const [k,v] of Object.entries(changes))if(k in DEFAULTS)state[k]=v.newValue;if(state.armed&&!state.armedStartedAt){state.armedStartedAt=Date.now();chrome.storage.local.set({armedStartedAt:state.armedStartedAt}).catch(()=>{});}renderAll();});

  async function init(){state=await chrome.storage.local.get(DEFAULTS);state.refreshSeconds=Math.max(5,+state.refreshSeconds||5);if(state.armed&&!state.armedStartedAt){state.armedStartedAt=Date.now();await chrome.storage.local.set({armedStartedAt:state.armedStartedAt});}nextRefreshAt=Date.now()+state.refreshSeconds*1000;buildPanel();setStatus(state.armed?(state.paused?"PAUSED":"ARMED — watching"):"DISARMED",state.armed?(state.paused?"warning":"armed"):"off");const mo=new MutationObserver(()=>{clearTimeout(observerTimer);observerTimer=setTimeout(scan,250);});mo.observe(document.documentElement,{childList:true,subtree:true,characterData:true});setInterval(heartbeat,250);setInterval(()=>{blankGuard();scan();},1200);scan();window.VTOLicense.startWatch(async()=>{if(state.armed)await disarm("License inactive");if(panel)panel.style.display="none";});}
  window.VTOLicense.waitForValid().then(init).catch(()=>{});
})();