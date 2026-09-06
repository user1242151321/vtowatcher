const $ = id => document.getElementById(id);
const messageEl=$("message"), activateBox=$("activateBox"), activeBox=$("activeBox"), keyInput=$("licenseKey"), activateBtn=$("activateBtn"), deactivateBtn=$("deactivateBtn"), openBtn=$("openBtn"), expiresEl=$("expires"), labelEl=$("licenseLabel"), deviceEl=$("device"), versionAccessEl=$("versionAccess"), currentVersionEl=$("currentVersion");
const updateBox=$("updateBox"), updateHeading=$("updateHeading"), updateText=$("updateText"), updateBtn=$("updateBtn"), noUpdateUrl=$("noUpdateUrl"), copyStepsBtn=$("copyStepsBtn");
const healthPage=$("healthPage"), healthWatcher=$("healthWatcher"), healthSession=$("healthSession");
let currentUpdateUrl=null;
currentVersionEl.textContent=chrome.runtime.getManifest().version;

const UPDATE_STEPS=["VTO Watcher manual update:","1. Download the update ZIP.","2. Extract it.","3. Replace the files in your VTO extension folder.","4. Open chrome://extensions.","5. Press Reload on VTO Watcher.","6. Open the extension and confirm the new version is shown."].join("\n");

function setMessage(text,state="loading"){
  messageEl.textContent=text;
  messageEl.dataset.state=state;
}
function setHealthChip(el,text,state="busy"){
  if(!el)return;
  const value=el.querySelector("strong");
  if(value)value.textContent=text;
  el.dataset.state=state;
}
function formatExpiry(value){if(!value)return"No expiration";const d=new Date(value);return Number.isNaN(d.getTime())?String(value):d.toLocaleDateString()+" "+d.toLocaleTimeString();}
function showUpdate(status){
  const required=Boolean(status?.updateRequired)||status?.reason==="update_required";
  const available=required||Boolean(status?.updateAvailable);
  if(!available){updateBox.classList.add("hidden");updateBox.classList.remove("required");currentUpdateUrl=null;return;}
  updateBox.classList.remove("hidden");updateBox.classList.toggle("required",required);
  updateHeading.textContent=required?"UPDATE REQUIRED":"UPDATE AVAILABLE";
  const parts=[];if(status.latestVersion)parts.push(`Latest: v${status.latestVersion}.`);parts.push(status.updateMessage||(required?"This version has been disabled by the owner.":"A newer VTO Watcher version is available."));
  updateText.textContent=parts.join(" ");currentUpdateUrl=status.updateUrl||null;updateBtn.classList.toggle("hidden",!currentUpdateUrl);noUpdateUrl.classList.toggle("hidden",Boolean(currentUpdateUrl));
}
function renderWatcherHealth(h){
  const page=String(h?.pageState||"OTHER").toUpperCase();
  if(page==="VTO")setHealthChip(healthPage,"VTO page","good");
  else if(page==="LOGIN")setHealthChip(healthPage,"Sign in","bad");
  else if(page==="ERROR"||page==="BLANK")setHealthChip(healthPage,page==="BLANK"?"Blank":"Error","bad");
  else setHealthChip(healthPage,"A to Z","warn");

  if(h?.armed){
    if(h?.paused)setHealthChip(healthWatcher,"Paused","warn");
    else if(h?.scanning||h?.refreshing)setHealthChip(healthWatcher,"Scanning","busy");
    else setHealthChip(healthWatcher,"Armed","good");
  }else setHealthChip(healthWatcher,"Ready","good");

  const session=String(h?.sessionState||"UNKNOWN").toUpperCase();
  if(session==="OK")setHealthChip(healthSession,"Healthy","good");
  else if(session==="PROMPT")setHealthChip(healthSession,"Continuing","warn");
  else if(session==="AUTH"||session==="LOGIN")setHealthChip(healthSession,"Sign in","bad");
  else setHealthChip(healthSession,"Unknown","warn");
}
async function refreshWatcherHealth(){
  if(!healthPage)return;
  try{
    const tabs=await chrome.tabs.query({url:"https://atoz.amazon.work/*"});
    if(!tabs.length){
      setHealthChip(healthPage,"Closed","warn");
      setHealthChip(healthWatcher,"Offline","warn");
      setHealthChip(healthSession,"—","busy");
      return;
    }
    const tab=tabs.find(t=>t.active)||tabs[0];
    setHealthChip(healthPage,"A to Z","good");
    try{
      const h=await chrome.tabs.sendMessage(tab.id,{type:"watcherHealth"});
      if(h?.ok)renderWatcherHealth(h);
      else{
        setHealthChip(healthWatcher,"Loading","busy");
        setHealthChip(healthSession,"Unknown","warn");
      }
    }catch{
      setHealthChip(healthWatcher,"Reload tab","warn");
      setHealthChip(healthSession,"Unknown","warn");
    }
  }catch{
    setHealthChip(healthPage,"Unknown","warn");
    setHealthChip(healthWatcher,"Unknown","warn");
    setHealthChip(healthSession,"Unknown","warn");
  }
}
async function refreshStatus(force=true){
  setMessage("Checking license…","loading");activateBtn.disabled=true;deactivateBtn.disabled=true;openBtn.disabled=true;
  try{
    const status=await chrome.runtime.sendMessage({type:"licenseStatus",force});showUpdate(status);
    if(status.valid){activateBox.classList.add("hidden");activeBox.classList.remove("hidden");setMessage(status.offlineGrace?"License active — temporary offline grace":"License active",status.offlineGrace?"warning":"success");expiresEl.textContent=formatExpiry(status.expiresAt);labelEl.textContent=status.label||"Active";deviceEl.textContent=(status.deviceId||"").slice(0,8)||"—";const maxMajor=Number(status.maxMajorVersion||4);versionAccessEl.textContent=maxMajor>=99?"All future":`Through V${maxMajor}`;refreshWatcherHealth();}
    else{activeBox.classList.add("hidden");activateBox.classList.remove("hidden");if(status.reason==="expired")setMessage("License expired","error");else if(status.reason==="update_required")setMessage(status.message||"Update required","warning");else if(status.reason==="version_not_allowed")setMessage(status.message||"This license does not include this version","error");else if(status.reason==="setup_required")setMessage("Owner setup required","error");else setMessage(status.message||"This device has not been activated.","warning");}
  }catch(err){activeBox.classList.add("hidden");activateBox.classList.remove("hidden");setMessage(`License check failed: ${err.message||err}`,"error");}
  finally{activateBtn.disabled=false;deactivateBtn.disabled=false;openBtn.disabled=false;}
}
activateBtn?.addEventListener("click",async()=>{const key=keyInput.value.trim();if(!key){setMessage("Enter a license key.","warning");return;}activateBtn.disabled=true;activateBtn.textContent="Activating…";setMessage("Activating…","loading");try{const result=await chrome.runtime.sendMessage({type:"activateLicense",key});showUpdate(result);if(!result.ok||!result.valid){setMessage(result.message||"Activation failed.","error");return;}keyInput.value="";await refreshStatus(false);}finally{activateBtn.disabled=false;activateBtn.textContent="Activate";}});
keyInput?.addEventListener("keydown",e=>{if(e.key==="Enter")activateBtn.click();});
deactivateBtn?.addEventListener("click",async()=>{deactivateBtn.disabled=true;deactivateBtn.textContent="Deactivating…";setMessage("Deactivating…","loading");try{await chrome.runtime.sendMessage({type:"deactivateLicense"});await refreshStatus(false);}finally{deactivateBtn.disabled=false;deactivateBtn.textContent="Deactivate";}});
openBtn?.addEventListener("click",()=>chrome.tabs.create({url:"https://atoz.amazon.work/"}));
updateBtn?.addEventListener("click",()=>{if(currentUpdateUrl)chrome.tabs.create({url:currentUpdateUrl});});
copyStepsBtn?.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(UPDATE_STEPS);copyStepsBtn.textContent="Copied";setTimeout(()=>copyStepsBtn.textContent="Copy update steps",1500);}catch{copyStepsBtn.textContent="Could not copy";}});
refreshStatus(true);
setInterval(()=>{if(!activeBox?.classList.contains("hidden"))refreshWatcherHealth();},2000);
