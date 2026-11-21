const fs=require('fs'),vm=require('vm'),assert=require('assert');
global.window={};
vm.runInThisContext(fs.readFileSync('extension/filters_470.js','utf8'));
const F=window.VTOFilters;

const base={
  ...F.DEFAULTS,
  minHours:0,
  maxHours:24,
  preferLongest:true,
  refreshSeconds:5
};

function offer(raw,startMinutes,hours){
  return {raw,startMinutes,hours,unavailable:false,startText:'',endText:'',classification:'LIVE'};
}

// Explicit date/day filtering.
let st={...base,allowedDays:{sun:false,mon:true,tue:false,wed:false,thu:false,fri:false,sat:false}};
let mon=offer('Monday, November 23, 2026 2:30pm - 6:30pm',870,4);
let tue=offer('Tuesday, November 24, 2026 2:30pm - 6:30pm',870,4);
assert.equal(F.filterOffers([tue,mon],st).length,1);
assert(F.filterOffers([tue,mon],st)[0].raw.startsWith('Monday'));

// Unknown day fails closed when weekday filter is restrictive.
assert.equal(F.filterOffers([offer('2:30pm - 6:30pm',870,4)],st).length,0);

// Date ranges.
st={...base,dateFilterEnabled:true,dateRanges:[{start:'2026-11-23',end:'2026-11-25'}],allowedDays:F.DEFAULTS.allowedDays};
assert.equal(F.filterOffers([mon],st).length,1);
assert.equal(F.filterOffers([offer('Monday, November 30, 2026 2:30pm - 6:30pm',870,4)],st).length,0);

// Duration gates.
st={...base,minHours:3,maxHours:5};
assert.equal(F.filterOffers([offer('Monday, November 23, 2026 2:30pm - 6:30pm',870,4)],st).length,1);
assert.equal(F.filterOffers([offer('Monday, November 23, 2026 2:30pm - 8:30pm',870,6)],st).length,0);

// Allowed hours, including overnight.
st={...base,allowedHoursEnabled:true,allowedStart:'22:00',allowedEnd:'08:00'};
assert.equal(F.filterOffers([offer('Monday, November 23, 2026 11:00pm - 7:00am',1380,8)],st).length,1);
assert.equal(F.filterOffers([offer('Monday, November 23, 2026 7:00pm - 11:00pm',1140,4)],st).length,0);

// Priority windows beat longest-first.
st={...base,priorityWindows:[
  {enabled:true,start:'22:00',end:'09:00'},
  {enabled:true,start:'09:00',end:'18:00'},
  {enabled:false,start:'00:00',end:'23:59'}
]};
const p2=offer('Monday, November 23, 2026 9:00am - 5:00pm',540,8);
const p1=offer('Monday, November 23, 2026 11:00pm - 7:00am',1380,8);
assert.equal(F.filterOffers([p2,p1],st)[0].raw,p1.raw);

// Preflight validation.
assert(F.validate({...base,allowedDays:{sun:false,mon:false,tue:false,wed:false,thu:false,fri:false,sat:false}}).length>0);
assert(F.validate({...base,minHours:6,maxHours:4}).length>0);

// Safe random cadence remains 5–10 seconds.
for(let i=0;i<100;i++){const d=F.nextDelayMs({...base,refreshMode:'random'});assert(d>=5000&&d<=10000);}
console.log('filter_470 tests passed');
