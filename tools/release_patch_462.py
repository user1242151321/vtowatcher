from pathlib import Path
import json

root=Path('.release-462')
engine=root/'vto_engine_450.js'
s=engine.read_text()

def once(old,new,name):
    global s
    if old not in s:
        raise SystemExit(f'missing marker: {name}')
    s=s.replace(old,new,1)

once(
'''  const clickables = (root=document) => [...root.querySelectorAll('button,a[href],[role="button"],[role="menuitem"],[role="tab"],input[type="button"],input[type="submit"],[tabindex]')].filter(visible).filter(el=>!el.closest?.("#vto-v4-panel"));''',
'''  const CLICKABLE_SELECTOR = 'button,a[href],[role="button"],[role="menuitem"],[role="tab"],input[type="button"],input[type="submit"],[tabindex]';
  const clickables = (root=document) => {
    const found=[...root.querySelectorAll(CLICKABLE_SELECTOR)];
    if(root instanceof Element && root.matches(CLICKABLE_SELECTOR)) found.unshift(root);
    return [...new Set(found)].filter(visible).filter(el=>!el.closest?.("#vto-v4-panel"));
  };''','clickables')
once('''    const acts=clickables(card);''','''    const acts=clickables(card);
    const wrapper=card?.closest?.(CLICKABLE_SELECTOR);
    if(wrapper&&visible(wrapper)&&!wrapper.closest?.("#vto-v4-panel")&&!acts.includes(wrapper)) acts.unshift(wrapper);''','card wrapper')
once('''    const direct=["accept","claim","take vto","request vto","get vto","request"];''','''    const direct=["accept","accept vto","claim","claim vto","take vto","request vto","get vto","request","apply","apply vto"];''','direct labels')
once('''    const openers=["select","continue","view","details","open"];''','''    const openers=["select","select vto","continue","view","details","open","next","review","choose"];''','opener labels')
once('''    return el?{el,label:textOf(el)}:null;''','''    if(el)return {el,label:textOf(el)};
    if(card instanceof Element && card.matches(CLICKABLE_SELECTOR) && visible(card)) return {el:card,label:"clickable VTO card"};
    return null;''','card root action')
once('''  function confirmButton(){ return clickables().find(el=>{const t=textOf(el); return t==="confirm"||t==="confirm vto"||t.includes("confirm accept")||t.includes("confirm acceptance")||t==="yes, accept"||t==="yes accept";})||null; }''','''  function confirmButton(){
    const all=clickables();
    let el=all.find(el=>{const t=textOf(el);return t==="confirm"||t==="confirm vto"||t.includes("confirm accept")||t.includes("confirm acceptance")||t==="yes, accept"||t==="yes accept"||t==="accept vto"||t==="accept voluntary time off";});
    if(el)return el;
    const roots=[...document.querySelectorAll('[role="dialog"],[aria-modal="true"],dialog,form')].filter(visible).filter(root=>{const t=norm(root.innerText||root.textContent||"");return t.includes("vto")||t.includes("voluntary time off")||t.includes("accept")||t.includes("claim");});
    for(const root of roots){
      el=clickables(root).find(x=>{const t=textOf(x);return ["submit","submit request","complete","confirm","accept","accept vto","yes","continue"].some(k=>t===k||t.startsWith(k+" "));});
      if(el)return el;
    }
    return null;
  }''','confirm function')
once('''    try{ el.setAttribute("data-vto-engine-action","1"); el.scrollIntoView({block:"center",behavior:"auto"}); await sleep(120); el.click(); pendingActionAt=Date.now(); pendingStage=stage; await sleep(650); return true; }''','''    try{ el.setAttribute("data-vto-engine-action","1"); el.scrollIntoView({block:"center",behavior:"auto"}); await sleep(120); el.click(); pendingActionAt=Date.now(); pendingStage=stage; nextRefreshAt=Math.max(nextRefreshAt,Date.now()+30000); log("REFRESH HOLD",`30s while ${stage} completes`); await sleep(650); return true; }''','refresh hold')
once('''      if(pendingStage==="CONFIRM CLICK"&&pendingActionAt&&Date.now()-pendingActionAt<5000){setStatus("Verifying VTO acceptance…","found");return;}''','''      if(pendingStage==="CONFIRM CLICK"&&pendingActionAt&&Date.now()-pendingActionAt<15000){setStatus("Verifying VTO acceptance…","found");return;}''','confirm wait')
once('''      if(pendingStage==="OFFER ACTION"&&pendingActionAt&&Date.now()-pendingActionAt<5000){setStatus("Waiting for VTO offer…","found");return;}''','''      if(pendingStage==="OFFER ACTION"&&pendingActionAt&&Date.now()-pendingActionAt<20000){setStatus("Waiting for VTO confirmation…","found");return;}
      if(pendingActionAt&&Date.now()-pendingActionAt>=30000){log("ACTION TIMEOUT",`${pendingStage||"action"} did not complete within 30s; resuming scan`);pendingActionAt=0;pendingStage="";}''','offer wait')
once('''    if(refreshing||!state.armed||state.paused||Date.now()<refreshHoldUntil)return false;''','''    if(refreshing||acting||!state.armed||state.paused||Date.now()<refreshHoldUntil||(pendingActionAt&&Date.now()-pendingActionAt<30000))return false;''','refresh race guard')
old='''`refresh=${state.refreshSeconds}s minHours=${state.minHours} startAfter=${state.startAfter} preferLongest=${state.preferLongest}`,`stats: ${JSON.stringify(stats)}`'''
new='''`refresh=${state.refreshSeconds}s minHours=${state.minHours} startAfter=${state.startAfter} preferLongest=${state.preferLongest}`,`pendingStage=${pendingStage||"none"} pendingAgeMs=${pendingActionAt?Date.now()-pendingActionAt:0}`,`eligibleOffers=${eligible().length} totalOffers=${offers().length} confirmVisible=${Boolean(confirmButton())}`,`stats: ${JSON.stringify(stats)}`'''
once(old,new,'diagnostics')
engine.write_text(s)

manifest=root/'manifest.json'
m=json.loads(manifest.read_text())
m['version']='4.6.2'
m['description']='VTO Watcher v4.6.2 fixes the live acceptance race by holding refreshes during offer and confirmation flow, broadens safe VTO action recognition, and keeps the restored 4.6.1 UI.'
manifest.write_text(json.dumps(m,indent=2)+'\n')
