from pathlib import Path
import json

root=Path('.release-463')
p=root/'vto_engine_450.js'
s=p.read_text()

s=s.replace(
'''    return [...new Set(found)].filter(visible).filter(el=>!el.closest?.("#vto-v4-panel"));''',
'''    return [...new Set(found)].filter(visible).filter(el=>!el.disabled&&norm(el.getAttribute?.("aria-disabled")||"")!=="true").filter(el=>!el.closest?.("#vto-v4-panel"));''',1)

start=s.index('  function unavailable(text)')
end=s.index('  function eligible()', start)
new_block=r'''  function unavailable(text){ const t=norm(text); return ["vto filled","vto full","opportunity filled","no longer available","unavailable","expired","already accepted","previously accepted","you accepted","vto accepted"].some(x=>t.includes(x)); }
  function timeRanges(text){
    const re=/\b\d{1,2}:\d{2}\s*(?:am|pm)\s*[-–—]\s*\d{1,2}:\d{2}\s*(?:am|pm)\b/ig;
    return [...new Set((String(text||"").match(re)||[]).map(x=>norm(x)))];
  }
  function hasRange(text){ return timeRanges(text).length>0; }
  function clockMinutes(raw){ const m=String(raw||"").match(/(\d{1,2}):(\d{2})\s*(am|pm)/i); if(!m)return null; let h=+m[1],n=+m[2]; if(h===12)h=0; if(m[3].toLowerCase()==="pm")h+=12; return h*60+n; }
  function rangeInfo(text){ const m=String(text||"").match(/(\d{1,2}:\d{2}\s*(?:am|pm))\s*[-–—]\s*(\d{1,2}:\d{2}\s*(?:am|pm))/i); if(!m)return null; const start=clockMinutes(m[1]); let end=clockMinutes(m[2]); if(start==null||end==null)return null; if(end<=start)end+=1440; return {startText:m[1],endText:m[2],startMinutes:start,hours:(end-start)/60}; }
  function parseHours(text){ const h=String(text||"").match(/(\d+(?:\.\d+)?)\s*hrs?/i), m=String(text||"").match(/(\d+)\s*mins?/i); let v=0; if(h)v+=+h[1]; if(m)v+=+m[1]/60; return v||rangeInfo(text)?.hours||0; }
  function inferLocation(text){ return String(text||"").split(/\n+/).map(x=>x.trim()).filter(Boolean).find(x=>x.length<80&&!/vto|voluntary|filled|accepted|\d{1,2}:\d{2}|hrs?|mins?|confirm|accept|claim/i.test(x))||""; }
  function staleLabelInCard(card){
    if(!card)return false;
    const stale=["vto filled","vto full","opportunity filled","no longer available","unavailable","expired","already accepted","previously accepted","you accepted","vto accepted"];
    const nodes=[card,...card.querySelectorAll('span,div,p,strong,b,[role="status"],[class*="status" i]')];
    return nodes.some(el=>{
      if(!visible(el))return false;
      const t=norm(el.innerText||el.textContent||"");
      if(!t||t.length>140||hasRange(t))return false;
      return stale.some(x=>t===x||t.startsWith(x+" ")||t.endsWith(" "+x));
    });
  }
  function strongLiveAction(card){
    const live=["accept","accept vto","accept voluntary time off","claim","claim vto","take vto","request vto","get vto","request","apply","apply vto"];
    return clickables(card).some(el=>{const t=textOf(el);return live.some(k=>t===k||t.startsWith(k+" ")||t.includes(" "+k));});
  }
  function expandCard(seed){
    let cur=seed,best=seed;
    for(let i=0;i<9&&cur&&cur!==document.body;i++){
      const raw=cur.innerText||"", ranges=timeRanges(raw);
      if(!ranges.length){cur=cur.parentElement;continue;}
      if(ranges.length>1) break;
      if(norm(raw).length<2600) best=cur;
      const acts=clickables(cur);
      if(staleLabelInCard(cur)||strongLiveAction(cur)||acts.some(a=>/accept|claim|request|select|continue|view|details|open|choose|review/i.test(textOf(a)))) return cur;
      cur=cur.parentElement;
    }
    return best;
  }
  function offers(){
    if(!isVtoContext()) return [];
    const seeds=[...document.querySelectorAll("div,section,article,li")].filter(visible).filter(el=>timeRanges(el.innerText||"").length===1&&norm(el.innerText||"").length<2600).filter(el=>![...el.children].some(c=>hasRange(c.innerText||"")));
    return [...new Set(seeds.map(expandCard).filter(Boolean))].map(card=>{ const raw=card.innerText||"", r=rangeInfo(raw); const stale=staleLabelInCard(card); const liveAction=strongLiveAction(card); return {card,raw,startText:r?.startText||"",endText:r?.endText||"",startMinutes:r?.startMinutes??null,hours:parseHours(raw),location:inferLocation(raw),unavailable:stale&&!liveAction,staleLabel:stale,liveAction}; });
  }
'''
s=s[:start]+new_block+s[end:]
s=s.replace('  let originalTitle=document.title, flashTimer=null, observerTimer=null, lastSessionKeepAliveAt=0, lastLoginNoticeAt=0;','  let originalTitle=document.title, flashTimer=null, observerTimer=null, lastSessionKeepAliveAt=0, lastLoginNoticeAt=0, lastClassifySignature="";',1)
old='''      const old=offers().filter(o=>o.unavailable).length;\n      if(!best){ lastOfferSignature=""; if(old){stats.old=Math.max(stats.old,old);setStatus(`Watching — ${old} filled/old`,"armed");}else setStatus("Watching for VTO","armed");renderStats();return; }'''
new='''      const allOffers=offers(), old=allOffers.filter(o=>o.unavailable).length;\n      if(!best){\n        lastOfferSignature="";\n        const classify=allOffers.map(o=>`${o.startText||"?"}-${o.endText||"?"}:${o.unavailable?"OLD":"LIVE"}:${o.liveAction?"action":"noaction"}`).join(" | ");\n        if(classify&&classify!==lastClassifySignature){lastClassifySignature=classify;log("CLASSIFY",classify);}\n        if(old){stats.old=Math.max(stats.old,old);setStatus(`Watching — ${old} filled/old`,"armed");}else setStatus("Watching for VTO","armed");renderStats();return;\n      }\n      lastClassifySignature="";'''
if old not in s: raise SystemExit('missing classify block')
s=s.replace(old,new,1)
s=s.replace('pendingActionAt=0;pendingStage="";lastOfferSignature="";const started=Date.now();','pendingActionAt=0;pendingStage="";lastOfferSignature="";lastClassifySignature="";const started=Date.now();',1)
s=s.replace('pendingActionAt=0;pendingStage="";lastOfferSignature="";stopFlash();','pendingActionAt=0;pendingStage="";lastOfferSignature="";lastClassifySignature="";stopFlash();',1)
p.write_text(s)

p=root/'manifest.json'
m=json.loads(p.read_text())
m['version']='4.6.3'
m['description']='VTO Watcher v4.6.3 fixes fresh VTO cards being misclassified as filled/old by isolating each offer card, preferring enabled live actions, and adds classification diagnostics while keeping the 4.6.2 acceptance race fix.'
p.write_text(json.dumps(m,indent=2)+'\n')
