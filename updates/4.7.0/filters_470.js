(() => {
  'use strict';
  if (window.VTOFilters) return;

  const DAY_KEYS = ['sun','mon','tue','wed','thu','fri','sat'];
  const DEFAULTS = {
    dateFilterEnabled:false,
    dateRanges:[{start:'',end:''},{start:'',end:''},{start:'',end:''}],
    allowedDays:{sun:true,mon:true,tue:true,wed:true,thu:true,fri:true,sat:true},
    allowedHoursEnabled:false,
    allowedStart:'00:00',
    allowedEnd:'23:59',
    maxHours:24,
    priorityWindows:[
      {enabled:false,start:'00:00',end:'23:59'},
      {enabled:false,start:'00:00',end:'23:59'},
      {enabled:false,start:'00:00',end:'23:59'}
    ],
    refreshMode:'fixed'
  };

  const norm = s => String(s || '').replace(/\s+/g,' ').trim().toLowerCase();
  const pad = n => String(n).padStart(2,'0');
  const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  function parseClock(v){
    const m=String(v||'').match(/^(\d{1,2}):(\d{2})$/);
    if(!m)return null;
    const h=+m[1],n=+m[2];
    return h>=0&&h<24&&n>=0&&n<60?h*60+n:null;
  }
  function parseDate(raw){
    const t=String(raw||'');
    let m=t.match(/\b(20\d{2})[-\/](\d{1,2})[-\/](\d{1,2})\b/);
    if(m){const d=new Date(+m[1],+m[2]-1,+m[3]);return {key:dateKey(d),weekday:d.getDay()};}
    m=t.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
    if(m){const d=new Date(+m[3],+m[1]-1,+m[2]);return {key:dateKey(d),weekday:d.getDay()};}
    const months={jan:0,january:0,feb:1,february:1,mar:2,march:2,apr:3,april:3,may:4,jun:5,june:5,jul:6,july:6,aug:7,august:7,sep:8,sept:8,september:8,oct:9,october:9,nov:10,november:10,dec:11,december:11};
    m=t.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:,?\s+(20\d{2}))?\b/i);
    if(m){
      const mon=months[m[1].toLowerCase()];
      let year=m[3]?+m[3]:new Date().getFullYear();
      let d=new Date(year,mon,+m[2]);
      const now=new Date(); now.setHours(0,0,0,0);
      if(!m[3]&&d.getTime()<now.getTime()-120*86400000)d=new Date(year+1,mon,+m[2]);
      return {key:dateKey(d),weekday:d.getDay()};
    }
    const dayName=t.match(/\b(sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)\b/i);
    if(dayName){
      const key=dayName[1].slice(0,3).toLowerCase();
      return {key:'',weekday:DAY_KEYS.indexOf(key)};
    }
    return {key:'',weekday:null};
  }
  function insideWindow(start,duration,startStr,endStr){
    const a=parseClock(startStr), b=parseClock(endStr);
    if(a==null||b==null||start==null)return true;
    const end=(start+Math.round(Number(duration||0)*60))%1440;
    if(a<=b) return start>=a && end<=b && start<=end;
    // Overnight window is a continuous interval from a through b on the next day.
    const dur=Math.round(Number(duration||0)*60);
    let sAdj=start, eAdj=start+dur;
    if(sAdj<a){sAdj+=1440;eAdj+=1440;}
    return sAdj>=a && eAdj<=b+1440;
  }
  function dateAllowed(meta,state){
    const days=state.allowedDays||DEFAULTS.allowedDays;
    const restrictedDays=DAY_KEYS.some(k=>days[k]===false);
    if(meta.weekday!=null && days[DAY_KEYS[meta.weekday]]===false)return false;
    if(meta.weekday==null && restrictedDays)return false;
    if(!state.dateFilterEnabled)return true;
    if(!meta.key)return false;
    const ranges=(state.dateRanges||[]).filter(r=>r&&r.start&&r.end);
    if(!ranges.length)return false;
    return ranges.some(r=>meta.key>=r.start&&meta.key<=r.end);
  }
  function priorityRank(o,state){
    const list=state.priorityWindows||DEFAULTS.priorityWindows;
    for(let i=0;i<list.length;i++){
      const p=list[i]; if(!p?.enabled)continue;
      if(insideWindow(o.startMinutes,o.hours,p.start,p.end))return i;
    }
    return 999;
  }
  function classify(o,state){
    if(o.unavailable)return {ok:false,reason:'unavailable'};
    const meta=parseDate(o.raw);
    if(!dateAllowed(meta,state))return {ok:false,reason:'date/day'};
    const min=Math.max(0,Number(state.minHours||0));
    const max=Math.max(min,Number(state.maxHours??24));
    if(Number(o.hours||0)<min)return {ok:false,reason:'too-short'};
    if(Number(o.hours||0)>max)return {ok:false,reason:'too-long'};
    if(state.allowedHoursEnabled&&!insideWindow(o.startMinutes,o.hours,state.allowedStart,state.allowedEnd))return {ok:false,reason:'hours'};
    return {ok:true,reason:'match',meta,priority:priorityRank(o,state)};
  }
  function filterOffers(list,state){
    const out=[];
    for(const o of list||[]){
      const c=classify(o,state);
      if(c.ok)out.push({...o,filterMeta:c.meta,priorityRank:c.priority});
    }
    out.sort((a,b)=>{
      const pa=a.priorityRank??999,pb=b.priorityRank??999;
      if(pa!==pb)return pa-pb;
      if(state.preferLongest!==false)return Number(b.hours||0)-Number(a.hours||0);
      return Number(a.startMinutes??9999)-Number(b.startMinutes??9999);
    });
    return out;
  }
  function validate(state){
    const problems=[];
    const days=state.allowedDays||DEFAULTS.allowedDays;
    if(!Object.values(days).some(Boolean))problems.push('Select at least one day of the week.');
    if(state.dateFilterEnabled){
      const ranges=(state.dateRanges||[]).filter(r=>r?.start||r?.end);
      if(!ranges.length)problems.push('Add at least one date range or turn Date ranges off.');
      if(ranges.some(r=>!r.start||!r.end||r.start>r.end))problems.push('Fix the date range start/end dates.');
    }
    const min=Math.max(0,Number(state.minHours||0)),max=Number(state.maxHours??24);
    if(!Number.isFinite(max)||max<min)problems.push('Maximum VTO length must be at least the minimum.');
    if(state.allowedHoursEnabled&&(parseClock(state.allowedStart)==null||parseClock(state.allowedEnd)==null))problems.push('Fix the allowed-hours window.');
    return problems;
  }
  function nextDelayMs(state){
    const base=Math.max(5,Number(state.refreshSeconds)||5);
    if(state.refreshMode==='random')return (5+Math.random()*5)*1000;
    return base*1000;
  }

  window.VTOFilters={DEFAULTS,DAY_KEYS,parseDate,parseClock,insideWindow,classify,filterOffers,validate,nextDelayMs};
})();