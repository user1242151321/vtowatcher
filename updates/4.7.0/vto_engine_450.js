(() => {
  "use strict";
  if (window.__VTO_WATCHER_450__) return;
  window.__VTO_WATCHER_450__ = true;

  const VERSION = chrome.runtime.getManifest().version;
  const F = window.VTOFilters;
  const DEFAULTS = {
    ...F.DEFAULTS,
    armed:false, paused:false, refreshSeconds:5, autoConfirm:false, testMode:false,
    soundEnabled:true, notificationsEnabled:true, tabFlashEnabled:true,
    minHours:0, startAfter:"any", preferLongest:true, maxAcceptsPerArm:1,
    acceptedThisArm:0, panelX:null, panelY:null, panelMinimized:false,
    armedStartedAt:0
  };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const norm = s => String(s || "").replace(/\s+/g," ").trim().toLowerCase();
  const R = window.VTOReliability;
  const visible = R.visible;
  const textOf = R.label;
  const CLICKABLE_SELECTOR = 'button,a[href],[role="button"],input[type="button"],input[type="submit"]';
  const clickables = R.actions;
  const bodyText = () => norm((document.querySelector("main,[role='main'],#root,#app") || document.body)?.innerText || document.body?.innerText || "");
  const nowText = () => new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"});
  const duration = ms => { const t=Math.max(0,Math.floor(ms/1000)); return `${String(Math.floor(t/3600)).padStart(2,"0")}:${String(Math.floor((t%3600)/60)).padStart(2,"0")}:${String(t%60).padStart(2,"0")}`; };

  let state={...DEFAULTS}, panel, ui={}, logs=[], stats={checks:0,refreshes:0,found:0,old:0,errors:0};
  let scanning=false, acting=false, refreshing=false, nextRefreshAt=0, refreshHoldUntil=0, lastActionAt=0, lastNoticeAt=0, pendingActionAt=0, pendingStage="", lastOfferSignature="";
  let originalTitle=document.title, flashTimer=null, observerTimer=null, lastSessionKeepAliveAt=0, lastLoginNoticeAt=0, lastClassifySignature="";

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
  async function handleSessionDialog(){
    const session = window.VTOSessionGuard.check();
    if(session.kind === 'CLEAR') return false;
    setStatus(session.kind === 'AUTH_REQUIRED' ? 'Amazon sign-in required — actions paused' : 'Amazon session prompt — actions paused','warning');
    return true;
  }
  function isLogin(){ return R.authRequired(); }
  function isPageError(){ const t=bodyText(); return ["something went wrong","try again later","unexpected error","page unavailable"].some(x=>t.includes(x)); }
  function offers(){ return isVtoContext() ? R.offers() : []; }
  function eligible(){ return F.filterOffers(offers(),state); }
  function describe(o){ if(!o)return "No eligible VTO currently detected."; return [o.startText&&o.endText?`${o.startText} – ${o.endText}`:"",o.hours?`${o.hours.toFixed(2).replace(/\.00$/,"")} hr`:"",o.location].filter(Boolean).join(" • "); }
  const actionFor = R.actionFor;
  function confirmButton(){ return transaction ? R.confirmation(transaction.offer) : null; }
  function beep(freq=800,d=0.1){ if(!state.soundEnabled)return; try{const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;const c=new AC(),o=c.createOscillator(),g=c.createGain();o.frequency.value=freq;g.gain.value=.04;o.connect(g);g.connect(c.destination);o.start();setTimeout(()=>{o.stop();c.close();},d*1000);}catch(_){} }
  function notify(title,message){ if(state.notificationsEnabled) chrome.runtime.sendMessage({type:"notify",title,message}).catch(()=>{}); }
  function flash(text="VTO FOUND — VTO Watcher"){ if(!state.tabFlashEnabled||flashTimer)return; originalTitle=document.title; let on=false; flashTimer=setInterval(()=>{on=!on;document.title=on?text:originalTitle;},650); setTimeout(stopFlash,12000); }
  function stopFlash(){ if(flashTimer)clearInterval(flashTimer);flashTimer=null;document.title=originalTitle; }
  function alertFound(o){ const n=Date.now();if(n-lastNoticeAt<5000)return;lastNoticeAt=n;beep(760,.09);setTimeout(()=>beep(980,.12),130);notify("VTO FOUND",describe(o));flash(); }

  let transaction = null, attemptSequence = 0, detectSignature = '', lifecycle = 0;
  function diagnostic(stage, reason){ R.event(stage, reason, transaction?.id || 0); log(stage, reason); }
  function blocked(){ return !state.armed || state.paused || R.session().kind !== 'CLEAR'; }
  async function uncertain(reason){
    diagnostic('VERIFY', reason);
    await save({paused:true});
    setStatus('Acceptance uncertain — check A to Z before rearming','warning');
    notify('VTO Watcher', 'Acceptance could not be verified. Check A to Z manually before disarming and rearming.');
  }
  async function clickVerified(el, stage){
    if(!R.enabled(el) || acting || refreshing || blocked()) return false;
    if(state.testMode){ diagnostic(stage,'TEST_NO_CLICK'); setStatus('TEST MODE — action detected','warning'); return false; }
    acting=true;
    try {
      await save({acceptancePending:true});
      if(blocked() || !transaction || !R.enabled(el)) return false;
      // Mark pending before clicking so synchronous DOM changes cannot outrun the transaction.
      pendingActionAt=Date.now(); pendingStage=stage;
      transaction.stage=stage; transaction.lastAt=Date.now(); transaction.clicked=true;
      diagnostic(stage,'CLICK'); el.click(); return true;
    } catch(_){ stats.errors++; await uncertain('CLICK_ERROR'); return false; }
    finally { acting=false; renderStats(); }
  }
  async function scan(){
    if(scanning || refreshing || !state.armed || state.paused) return;
    scanning=true;
    try {
      stats.checks++; if(ui.last) ui.last.textContent=nowText(); renderStats();
      if(await handleSessionDialog()) return;
      if(blocked()) return;
      if(transaction){
        if(transaction.clicked && R.freshSuccess(transaction.baseline,transaction.offer)){
          diagnostic('VERIFY','ACCEPTED_FRESH_SUCCESS');
          transaction=null; pendingActionAt=0; pendingStage='';
          state.armed=false; state.acceptedThisArm=Number(state.acceptedThisArm||0)+1;
          await save({armed:false,paused:false,acceptedThisArm:state.acceptedThisArm,armedStartedAt:0,acceptancePending:false});
          setStatus('VTO ACCEPTED!','success'); renderAll();
          notify('VTO ACCEPTED','Amazon displayed a new VTO acceptance success state.'); beep(1050,.12); return;
        }
        if(Date.now()-transaction.lastAt >= 30000){ await uncertain('TIMEOUT_NO_SUCCESS'); return; }
        const confirm=confirmButton();
        if(confirm && transaction.confirmed.get(confirm)!==textOf(confirm)){
          if(transaction.stage === 'CONFIRM' && !transaction.canAdvance) return;
          if(transaction.steps >= 3){ await uncertain('CONFIRM_STEP_LIMIT'); return; }
          if(!state.autoConfirm){ setStatus('VTO ready — Auto Confirm OFF','found'); return; }
          diagnostic('CONFIRM','CONTROL_DETECTED');
          transaction.confirmed.set(confirm,textOf(confirm)); transaction.steps++;
          transaction.canAdvance=/^(next|continue)$/.test(textOf(confirm));
          await clickVerified(confirm,'CONFIRM'); return;
        }
        setStatus(transaction.stage==='CONFIRM'?'Verifying VTO acceptance…':'Waiting for VTO confirmation…','found');return;
      }
      if(!isVtoContext()){setStatus('Open Schedule → VTO','warning');return;}
      if(isPageError()){setStatus('A to Z page error','error');return;}
      if(state.acceptedThisArm>=Number(state.maxAcceptsPerArm||1)){await disarm('Maximum VTO accepted');return;}
      const all=offers();
      const signature=all.map(o=>[o.startText,o.endText,o.classification].join(':')).join('|');
      if(signature!==detectSignature){detectSignature=signature;diagnostic('DETECT',signature||'NO_CARDS');}
      stats.old=all.filter(o=>o.classification==='OLD').length;
      const best=eligible()[0]; if(ui.offer)ui.offer.textContent=describe(best);
      if(!best){setStatus('Watching for VTO','armed');renderStats();return;}
      const action=actionFor(best.card); if(!action) return;
      if(state.testMode){setStatus('TEST MODE — eligible VTO detected','warning');return;}
      transaction={id:++attemptSequence,offer:best,baseline:new Set(R.successes().map(x=>x.text)),stage:'OPEN',lastAt:Date.now(),confirmed:new WeakMap(),steps:0,clicked:false};
      stats.found++; alertFound(best); diagnostic('DETECT','ELIGIBLE_OFFER');
      if(!await clickVerified(action.el,'OPEN') && !transaction?.clicked) transaction=null;
    } catch(_){ stats.errors++; diagnostic('ERROR','SCAN_EXCEPTION'); if(transaction) await uncertain('SCAN_ERROR'); }
    finally {scanning=false;}
  }

  const navControls = () => R.query('button,a[href],[role="button"],[role="menuitem"],[role="link"],[role="tab"]').filter(R.enabled);
  function matchesNav(el,kind){
    const t=textOf(el), href=el.getAttribute('href')||'';
    return kind==='schedule' ? t==='schedule'||/\/schedule(?:[/?#]|$)/i.test(href) : t==='vto'||t==='voluntary time off'||href.includes('/voluntary_time_off');
  }
  function navigationDrawer(root){
    if(root.matches('[role="alertdialog"]') || R.ranges(R.text(root)).length) return false;
    if(root.querySelector('form,input') || R.query('h1,h2,[role="heading"]',root).some(el=>/confirm|acceptance|session|sign in/i.test(R.text(el)))) return false;
    const named=/\b(menu|navigation)\b/.test(norm(root.getAttribute('aria-label')));
    const navigation=root.matches('nav,[role="navigation"],[role="menu"]')||root.querySelector('nav,[role="navigation"],[role="menu"]');
    const controls=navControls().filter(el=>root.contains(el));
    const hasSchedule=controls.some(el=>matchesNav(el,'schedule')),hasVto=controls.some(el=>matchesNav(el,'vto'));
    return !!(named||navigation||(hasSchedule&&hasVto)) && (hasSchedule||hasVto);
  }
  function blockingDialog(){
    return R.query('[role="dialog"],[role="alertdialog"],[aria-modal="true"],dialog').filter(visible).find(root=>!navigationDrawer(root));
  }
  function navTarget(kind){
    return navControls().find(el=>{
      const modal=el.closest('[role="dialog"],[role="alertdialog"],[aria-modal="true"],dialog');
      return (!modal||navigationDrawer(modal))&&matchesNav(el,kind);
    })||null;
  }
  async function findNav(kind,cancelled){
    let target=navTarget(kind); if(target)return target;
    const menu=navControls().find(el=>/^(menu|open menu|navigation menu|open navigation menu)$/.test(textOf(el)));
    if(menu && menu.getAttribute('aria-expanded')!=='true' && !cancelled()){
      menu.click();diagnostic('REFRESH','MENU_OPENED');
    }
    // React may replace the menu after navigation; resolve a fresh control each time.
    for(let i=0;i<15&&!cancelled();i++){
      target=navTarget(kind);if(target)return target;
      await sleep(100);
    }
    return null;
  }
  async function softRefresh(){
    if(refreshing||scanning||acting||transaction||blocked()||Date.now()<refreshHoldUntil||!isVtoContext())return false;
    if(eligible().length || blockingDialog()) {scan();return false;}
    refreshing=true; const generation=lifecycle; diagnostic('REFRESH','START');
    const cancelled=()=>blocked()||transaction||generation!==lifecycle||!!blockingDialog();
    try{
      const schedule=await findNav('schedule',cancelled);
      if(cancelled())return false;
      if(!schedule||!R.enabled(schedule)){diagnostic('REFRESH','SCHEDULE_NAV_MISSING');return false;}
      if(eligible().length)return false;
      schedule.click(); await sleep(450);
      if(cancelled())return false;
      const target=await findNav('vto',cancelled);
      if(cancelled())return false;
      if(!target||!R.enabled(target)){diagnostic('REFRESH','VTO_NAV_MISSING');return false;}
      target.click(); await sleep(650);
      if(blocked()||generation!==lifecycle)return false;
      stats.refreshes++;diagnostic('REFRESH','NAVIGATION_SENT');renderStats();return true;
    }catch(_){stats.errors++;diagnostic('REFRESH','ERROR');return false;}
    finally{refreshing=false;nextRefreshAt=Date.now()+F.nextDelayMs(state);scan();}
  }
  function blankGuard(){ if(!state.armed||state.paused||document.readyState!=="complete")return;const main=document.querySelector("main,[role='main']");if(!main)return;const r=main.getBoundingClientRect(),t=norm(main.innerText||main.textContent||"");if(r.height>=180&&t.length<25){refreshHoldUntil=Date.now()+60000;nextRefreshAt=refreshHoldUntil;setStatus("A to Z content blank — auto refresh paused","warning");log("BLANK GUARD","Refresh paused for 60s; no forced page reload");} }

  async function arm(){lifecycle++;transaction=null; const lic=await window.VTOLicense.requireValid(true);if(!lic?.valid){setStatus("License inactive","error");log("ARM BLOCKED","License inactive");return;} const problems=F.validate(state);if(problems.length){setStatus(problems[0],"warning");log("ARM BLOCKED",problems.join(" | "));return;} stats={checks:0,refreshes:0,found:0,old:0,errors:0};logs=[];pendingActionAt=0;pendingStage="";lastOfferSignature="";lastClassifySignature="";const started=Date.now();await save({armed:true,paused:false,acceptedThisArm:0,armedStartedAt:started});nextRefreshAt=started+F.nextDelayMs(state);setStatus("ARMED — watching","armed");log("ARMED",`v${VERSION}`);beep(650,.08);renderAll();scan(); }
  async function disarm(reason="Disarmed"){lifecycle++;transaction=null;state.armed=false;pendingActionAt=0;pendingStage="";lastOfferSignature="";lastClassifySignature="";stopFlash();await save({armed:false,paused:false,armedStartedAt:0,acceptancePending:false});nextRefreshAt=0;refreshHoldUntil=0;setStatus(reason,"off");log("DISARMED",reason);renderAll();}
  async function togglePause(){lifecycle++;if(!state.armed)return;await save({paused:!state.paused});if(state.paused){setStatus("PAUSED","warning");log("PAUSED");}else{nextRefreshAt=Date.now()+F.nextDelayMs(state);setStatus("ARMED — watching","armed");log("RESUMED");scan();}renderAll();}

  function renderStats(){if(ui.stats)ui.stats.textContent=`Checks ${stats.checks} • Refreshes ${stats.refreshes} • Found ${stats.found} • Old ${stats.old} • Errors ${stats.errors} • Accepted ${state.acceptedThisArm}/1`;}
  function renderLog(){if(!ui.log)return;if(!logs.length){ui.log.innerHTML='<div class="vto-empty">No activity yet</div>';return;}ui.log.innerHTML=logs.slice(0,18).map(x=>`<div class="vto-log-entry"><b>${esc(x.time)}</b> <span>${esc(x.step)}</span>${x.detail?`<small>${esc(x.detail)}</small>`:""}</div>`).join("");}
  const esc=s=>String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  function toggle(btn,on,label){if(!btn)return;btn.classList.toggle("on",!!on);btn.textContent=`${label}: ${on?"ON":"OFF"}`;}
  function renderAll(){ if(!panel)return;ui.arm.textContent=state.armed?"DISARM VTO":"ARM VTO";ui.arm.classList.toggle("disarm",state.armed);ui.pause.textContent=state.paused?"RESUME":"PAUSE";ui.pause.disabled=!state.armed;toggle(ui.auto,state.autoConfirm,"Auto Confirm");toggle(ui.test,state.testMode,"Test Mode");toggle(ui.sound,state.soundEnabled,"Sound");toggle(ui.notify,state.notificationsEnabled,"Notify");toggle(ui.flash,state.tabFlashEnabled,"Tab Flash");toggle(ui.longest,state.preferLongest,"Prefer Longest");ui.refresh.value=String(Math.max(5,Number(state.refreshSeconds)||5));ui.min.value=String(state.minHours??0);ui.max.value=String(state.maxHours??24);ui.interval.textContent=state.refreshMode==="random"?"Random":`${Math.max(5,Number(state.refreshSeconds)||5)}s`;panel.classList.toggle("vto-minimized",!!state.panelMinimized);renderStats();renderLog(); }

  async function copyDiagnostics(){ const header=[`VTO Watcher v${VERSION}`,`URL: ${location.origin}${location.pathname}`,`armed=${state.armed} paused=${state.paused} autoConfirm=${state.autoConfirm} testMode=${state.testMode}`,`refresh=${state.refreshMode==='random'?'random 5–10s':state.refreshSeconds+'s'} minHours=${state.minHours} maxHours=${state.maxHours} allowedHours=${state.allowedHoursEnabled?state.allowedStart+'-'+state.allowedEnd:'any'} preferLongest=${state.preferLongest}`,`pendingStage=${pendingStage||"none"} pendingAgeMs=${pendingActionAt?Date.now()-pendingActionAt:0}`,`eligibleOffers=${eligible().length} totalOffers=${offers().length} confirmVisible=${Boolean(confirmButton())}`,`stats: ${JSON.stringify(stats)}`,"--- activity ---"]; header.push("--- structured events ---",...R.events.map(e=>JSON.stringify(e))); const body=logs.slice().reverse().map(x=>`${x.time} | ${x.step}${x.detail?` | ${x.detail}`:""}`);try{await navigator.clipboard.writeText([...header,...body].join("\n"));log("DIAGNOSTICS COPIED");}catch(e){log("COPY FAILED",e?.message||e);} }

  function buildPanel(){
    if(document.getElementById("vto-v4-panel")){panel=document.getElementById("vto-v4-panel");return;}
    panel=document.createElement("div");panel.id="vto-v4-panel";panel.innerHTML=`
      <div class="vto-v4-header" id="vto-v4-drag"><div class="vto-v4-title"><span class="vto-v4-badge">V${VERSION.split('.').slice(0,2).join('.')}</span></div><div class="vto-v4-header-actions"><button class="vto-icon-btn" id="vto-v4-min">—</button></div></div>
      <div class="vto-v4-body"><div class="vto-status" id="vto-v4-status">Loading…</div>
      <div class="vto-grid-2"><div class="vto-card">Next refresh<strong id="vto-v4-countdown">--</strong></div><div class="vto-card">Last check<strong id="vto-v4-lastcheck">--</strong></div><div class="vto-card">Runtime<strong id="vto-v4-runtime">00:00:00</strong></div><div class="vto-card">Refresh interval<strong id="vto-v4-interval-label">5s</strong></div></div>
      <div class="vto-section"><div class="vto-section-title">Best eligible VTO</div><div class="vto-offer-box" id="vto-v4-offer">No eligible VTO currently detected.</div></div>
      <div class="vto-section"><div class="vto-section-title">Filters</div><div class="vto-grid-2"><div><label>Minimum hours</label><input class="vto-number" id="vto-v4-min-hours" type="number" min="0" max="24" step="0.25"></div><div><label>Maximum hours</label><input class="vto-number" id="vto-v4-max-hours" type="number" min="0" max="24" step="0.25"></div></div><button class="vto-toggle" id="vto-v4-longest">Prefer Longest</button></div>
      <div class="vto-section"><div class="vto-section-title">Watcher</div><div class="vto-grid-2"><select class="vto-select" id="vto-v4-refresh"><option value="5">5 seconds</option><option value="10">10 seconds</option><option value="15">15 seconds</option><option value="20">20 seconds</option><option value="30">30 seconds</option><option value="60">60 seconds</option></select><button class="vto-secondary" id="vto-v4-scan">Scan now</button></div><div class="vto-grid-2 vto-controls"><button class="vto-toggle" id="vto-v4-auto"></button><button class="vto-toggle" id="vto-v4-test"></button><button class="vto-toggle" id="vto-v4-sound"></button><button class="vto-toggle" id="vto-v4-notify"></button><button class="vto-toggle" id="vto-v4-flash"></button><button class="vto-secondary" id="vto-v4-pause">PAUSE</button></div><button class="vto-main" id="vto-v4-arm">ARM VTO</button></div>
      <div class="vto-section"><div class="vto-section-title" id="vto-v4-stats">Stats</div><div class="vto-grid-2"><button class="vto-secondary" id="vto-v4-copy">Copy Diagnostics</button><button class="vto-secondary" id="vto-v4-clear">Clear Log</button></div><div class="vto-log" id="vto-v4-activity"></div></div><div class="vto-footer">VTO only • verified offer-card actions • max 1 new VTO per arm</div></div>`;
    document.documentElement.appendChild(panel);
    const $=id=>panel.querySelector(id);ui={status:$("#vto-v4-status"),countdown:$("#vto-v4-countdown"),last:$("#vto-v4-lastcheck"),runtime:$("#vto-v4-runtime"),interval:$("#vto-v4-interval-label"),offer:$("#vto-v4-offer"),stats:$("#vto-v4-stats"),log:$("#vto-v4-activity"),arm:$("#vto-v4-arm"),pause:$("#vto-v4-pause"),auto:$("#vto-v4-auto"),test:$("#vto-v4-test"),sound:$("#vto-v4-sound"),notify:$("#vto-v4-notify"),flash:$("#vto-v4-flash"),longest:$("#vto-v4-longest"),refresh:$("#vto-v4-refresh"),min:$("#vto-v4-min-hours"),max:$("#vto-v4-max-hours")};
    ui.arm.onclick=()=>state.armed?disarm():arm();ui.pause.onclick=togglePause;$("#vto-v4-scan").onclick=()=>{log("MANUAL SCAN");scan();};ui.auto.onclick=async()=>{await save({autoConfirm:!state.autoConfirm});renderAll();scan();};ui.test.onclick=async()=>{await save({testMode:!state.testMode});log("TEST MODE",state.testMode?"ON":"OFF");renderAll();};ui.sound.onclick=async()=>{await save({soundEnabled:!state.soundEnabled});renderAll();if(state.soundEnabled)beep();};ui.notify.onclick=async()=>{await save({notificationsEnabled:!state.notificationsEnabled});renderAll();};ui.flash.onclick=async()=>{await save({tabFlashEnabled:!state.tabFlashEnabled});if(!state.tabFlashEnabled)stopFlash();renderAll();};ui.longest.onclick=async()=>{await save({preferLongest:!state.preferLongest});renderAll();scan();};ui.refresh.onchange=async()=>{const n=Math.max(5,+ui.refresh.value||5);await save({refreshSeconds:n});nextRefreshAt=Date.now()+n*1000;log("REFRESH INTERVAL",`${n}s`);renderAll();};ui.min.onchange=async()=>{await save({minHours:Math.max(0,+ui.min.value||0)});renderAll();scan();};ui.max.onchange=async()=>{await save({maxHours:Math.max(0,+ui.max.value||24)});renderAll();scan();};$("#vto-v4-copy").onclick=copyDiagnostics;$("#vto-v4-clear").onclick=()=>{logs=[];renderLog();};$("#vto-v4-min").onclick=async()=>{await save({panelMinimized:!state.panelMinimized});renderAll();};
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

  async function init(){state=await chrome.storage.local.get({...DEFAULTS,acceptancePending:false});if(state.acceptancePending){state.paused=true;await save({paused:true});diagnostic("VERIFY","INTERRUPTED_ATTEMPT_CHECK_AMAZON");}state.refreshSeconds=Math.max(5,+state.refreshSeconds||5);if(state.armed&&!state.armedStartedAt){state.armedStartedAt=Date.now();await chrome.storage.local.set({armedStartedAt:state.armedStartedAt});}nextRefreshAt=Date.now()+F.nextDelayMs(state);buildPanel();setStatus(state.armed?(state.paused?"PAUSED":"ARMED — watching"):"DISARMED",state.armed?(state.paused?"warning":"armed"):"off");const mo=new MutationObserver(records=>{if(records.every(r=>(r.target.nodeType===1?r.target:r.target.parentElement)?.closest?.("#vto-v4-panel")))return;clearTimeout(observerTimer);observerTimer=setTimeout(scan,100);});mo.observe(document.documentElement,{childList:true,subtree:true,characterData:true});setInterval(heartbeat,250);setInterval(()=>{blankGuard();scan();},1200);scan();window.VTOLicense.startWatch(async()=>{if(state.armed)await disarm("License inactive");if(panel)panel.style.display="none";});}
  window.VTOLicense.waitForValid().then(init).catch(()=>{});
})();
