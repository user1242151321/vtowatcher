from pathlib import Path


def patch_site():
    p = Path('index.html')
    s = p.read_text()
    if 'site_452.css' not in s:
        s = s.replace('<link rel="stylesheet" href="site_450.css">', '<link rel="stylesheet" href="site_450.css">\n  <link rel="stylesheet" href="site_452.css">')
    s = s.replace('id="heroVersion">v4.5.0<', 'id="heroVersion">v4.5.2<')
    s = s.replace('id="latestVersionBadge">v4.5.0<', 'id="latestVersionBadge">v4.5.2<')
    s = s.replace('VTO_Watcher_4.5.0.zip', 'VTO_Watcher_4.5.2.zip')
    s = s.replace(
        '<h3>Version 4.5.0</h3><span>Current</span></div><p>Replaced the stacked watcher patches with one unified engine, added detailed diagnostics, persistent runtime, responsive sizing, safer soft refresh, and clearer status colors.</p>',
        '<h3>Version 4.5.2</h3><span>Current</span></div><p>Restored the desktop watcher proportions, polished every extension popup state, kept safe session continuation, and refreshed the public website visual system.</p>'
    )
    p.write_text(s)

    p = Path('app.js')
    s = p.read_text()
    s = s.replace('const FALLBACK_VERSION = "4.5.0";', 'const FALLBACK_VERSION = "4.5.2";')
    s = s.replace('VTO_Watcher_4.5.0.zip', 'VTO_Watcher_4.5.2.zip')
    s = s.replace(
        'One unified watcher engine replaces the old patch stack, with persistent runtime, safer soft refresh, verified offer actions, stronger diagnostics, responsive sizing, and clearer status colors.',
        'V4.5.2 restores the desktop watcher proportions, polishes every extension popup state, keeps safe Amazon session continuation, and refreshes the website design.'
    )
    p.write_text(s)


def patch_engine():
    p = Path('.release-452/vto_engine_450.js')
    s = p.read_text()
    if 'lastSessionKeepAliveAt' in s:
        return

    old = 'let originalTitle=document.title, flashTimer=null, observerTimer=null;'
    new = 'let originalTitle=document.title, flashTimer=null, observerTimer=null, lastSessionKeepAliveAt=0, lastLoginNoticeAt=0;'
    if old not in s:
        raise SystemExit('engine state marker not found')
    s = s.replace(old, new, 1)

    marker = '  function isVtoContext(){ const t=bodyText(); return location.pathname.toLowerCase().includes("voluntary_time_off") || t.includes("voluntary time off") || t.includes("accepting voluntary time off") || t.includes("vto filled") || t.includes("vto accepted"); }\n'
    insert = '''  function sessionDialog(){
    const explicit=[...document.querySelectorAll('[role="dialog"],[aria-modal="true"],dialog,[class*="modal" i],[class*="dialog" i]')].filter(visible);
    const fallback=[...document.querySelectorAll("div,section")].filter(visible).filter(el=>{const t=norm(el.innerText||el.textContent||"");return t.length>0&&t.length<1200&&["are you still there","stay signed in","keep me signed in","session will expire","session is about to expire","session expired","session timeout","continue session"].some(x=>t.includes(x));});
    const roots=[...new Set([...explicit,...fallback])];
    const phrases=["are you still there","still there","stay signed in","keep me signed in","continue session","continue your session","session is about to expire","session will expire","extend session","keep working","remain signed in","stay logged in","keep me logged in","session timeout","session expired","your session has expired","your session is expiring"];
    const authPhrases=["enter your password","enter password","verification code","one-time password","one time password","two-step verification","two factor","security code","authenticator code","sign in to continue"];
    for(const root of roots){
      const t=norm(root.innerText||root.textContent||"");
      if(!phrases.some(p=>t.includes(p))) continue;
      if(authPhrases.some(p=>t.includes(p))) return {root,button:null,requiresAuth:true,text:t};
      const labels=["stay signed in","keep me signed in","continue session","continue","i'm still here","i’m still here","still here","keep working","extend session","yes, stay signed in","yes stay signed in","stay logged in","keep me logged in","continue working","ok","yes"];
      const button=clickables(root).find(el=>{const x=textOf(el);return labels.some(k=>x===k||x.startsWith(k+" "));})||null;
      return {root,button,requiresAuth:false,text:t};
    }
    return null;
  }
  async function handleSessionDialog(){
    const d=sessionDialog(); if(!d) return false;
    if(d.requiresAuth){refreshHoldUntil=Date.now()+60000;setStatus("Amazon sign-in required","error");if(Date.now()-lastLoginNoticeAt>60000){lastLoginNoticeAt=Date.now();log("SESSION AUTH REQUIRED","Amazon requires password/MFA; automatic refresh paused");notify("VTO Watcher","Amazon A to Z needs you to sign in again. Refreshing is paused.");}return true;}
    if(!d.button){refreshHoldUntil=Date.now()+15000;setStatus("Session prompt detected","warning");log("SESSION PROMPT","Session dialog found but no safe continue button was recognized");return true;}
    if(Date.now()-lastSessionKeepAliveAt<4000) return true;
    lastSessionKeepAliveAt=Date.now();log("SESSION KEEPALIVE","button="+textOf(d.button));
    try{d.button.setAttribute("data-vto-session-action","1");d.button.scrollIntoView({block:"center",behavior:"auto"});await sleep(100);d.button.click();await sleep(500);d.button.removeAttribute("data-vto-session-action");refreshHoldUntil=Date.now()+1200;nextRefreshAt=Date.now()+Math.max(5,Number(state.refreshSeconds||5))*1000;setStatus(state.armed?"Watching for VTO":"Session continued",state.armed?"armed":"off");log("SESSION CONTINUED","Amazon session continuation prompt dismissed");}
    catch(e){stats.errors++;log("SESSION KEEPALIVE ERROR",e?.message||e);setStatus("Could not continue Amazon session","warning");}
    return true;
  }
'''
    if marker not in s:
        raise SystemExit('session insertion marker not found')
    s = s.replace(marker, marker + insert, 1)

    old_scan = '      stats.checks++; if(ui.last)ui.last.textContent=nowText(); renderStats();\n      if(isLogin()){setStatus("Login required","error");log("STOP","Amazon login required");notify("VTO Watcher","Amazon A to Z needs you to log in again.");return;}'
    new_scan = '      stats.checks++; if(ui.last)ui.last.textContent=nowText(); renderStats();\n      if(await handleSessionDialog()) return;\n      if(isLogin()){refreshHoldUntil=Date.now()+60000;setStatus("Login required — refresh paused","error");if(Date.now()-lastLoginNoticeAt>60000){lastLoginNoticeAt=Date.now();log("STOP","Amazon login required; automatic refresh paused");notify("VTO Watcher","Amazon A to Z needs you to log in again. Refreshing is paused.");}return;}'
    if old_scan not in s:
        raise SystemExit('scan login marker not found')
    s = s.replace(old_scan, new_scan, 1)
    p.write_text(s)


if __name__ == '__main__':
    patch_site()
    patch_engine()
