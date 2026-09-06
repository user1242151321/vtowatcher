(() => {
  "use strict";
  if (window.__VTO_HEALTH_460__) return;
  window.__VTO_HEALTH_460__ = true;

  const norm = s => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
  const visible = el => {
    if (!el || !(el instanceof Element)) return false;
    const st = getComputedStyle(el), r = el.getBoundingClientRect();
    return st.display !== "none" && st.visibility !== "hidden" && Number(st.opacity || 1) > 0 && r.width > 0 && r.height > 0;
  };
  const textOf = el => norm(el?.innerText || el?.textContent || el?.value || el?.getAttribute?.("aria-label") || el?.getAttribute?.("title") || "");
  const bodyText = () => norm((document.querySelector("main,[role='main'],#root,#app") || document.body)?.innerText || "");
  const age = ts => {
    if (!ts) return "—";
    const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (s < 2) return "now";
    if (s < 60) return s + "s";
    return Math.floor(s / 60) + "m";
  };

  let storageState = { armed:false, paused:false };
  let pageState = "CHECKING", sessionState = "OK";
  let lastScanAt = 0, lastHealthyScanAt = 0, lastRefreshAt = 0;
  let lastCheckText = "", lastStatusText = "";
  let duplicateBlocks = 0, lastEngineAction = "", lastEngineActionAt = 0;
  let ui = {};

  chrome.storage.local.get({armed:false,paused:false}).then(v => storageState = {...storageState,...v}).catch(()=>{});
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.armed) storageState.armed = !!changes.armed.newValue;
    if (changes.paused) storageState.paused = !!changes.paused.newValue;
  });

  function sessionPrompt() {
    const roots = [...document.querySelectorAll('[role="dialog"],[aria-modal="true"],dialog,[class*="modal" i],[class*="dialog" i]')].filter(visible);
    const phrases = ["are you still there","stay signed in","keep me signed in","stay logged in","keep me logged in","session will expire","session is about to expire","session timeout","continue session"];
    return roots.some(root => {
      const t = norm(root.innerText || root.textContent || "");
      return phrases.some(p => t.includes(p));
    });
  }
  function loginRequired() {
    const t = bodyText();
    return location.pathname.toLowerCase().includes("login") || (t.includes("password") && (t.includes("sign in") || t.includes("log in"))) || t.includes("verification code");
  }
  function pageError() {
    const t = bodyText();
    return ["something went wrong","try again later","unexpected error","page unavailable"].some(x => t.includes(x));
  }
  function vtoContext() {
    const t = bodyText(), p = location.pathname.toLowerCase();
    return p.includes("voluntary_time_off") || t.includes("voluntary time off") || t.includes("accepting voluntary time off") || t.includes("no vto available") || t.includes("vto filled");
  }
  function blankPage() {
    if (document.readyState !== "complete") return false;
    const main = document.querySelector("main,[role='main']");
    if (!main) return false;
    const r = main.getBoundingClientRect(), t = norm(main.innerText || main.textContent || "");
    return r.height >= 180 && t.length < 25;
  }

  function ensureHealthStrip() {
    const panel = document.getElementById("vto-v4-panel");
    const status = document.getElementById("vto-v4-status");
    if (!panel || !status) return false;
    let strip = panel.querySelector("#vto-v4-health");
    if (!strip) {
      strip = document.createElement("div");
      strip.className = "vto-health";
      strip.id = "vto-v4-health";
      strip.innerHTML = '<div class="vto-health-chip" id="vto-v4-health-page" data-state="busy"><span>Page</span><b>Checking</b></div><div class="vto-health-chip" id="vto-v4-health-session" data-state="busy"><span>Session</span><b>Checking</b></div><div class="vto-health-chip" id="vto-v4-health-scan" data-state="busy"><span>Scan</span><b>Idle</b></div>';
      status.insertAdjacentElement("afterend", strip);
    }
    ui.page = panel.querySelector("#vto-v4-health-page");
    ui.session = panel.querySelector("#vto-v4-health-session");
    ui.scan = panel.querySelector("#vto-v4-health-scan");
    return true;
  }
  function setChip(el, value, state) {
    if (!el) return;
    const b = el.querySelector("b");
    if (b) b.textContent = value;
    el.dataset.state = state;
  }
  function detectHealth() {
    if (loginRequired()) {
      pageState = "LOGIN";
      sessionState = "AUTH";
    } else if (sessionPrompt()) {
      pageState = vtoContext() ? "VTO" : "OTHER";
      sessionState = "PROMPT";
    } else if (pageError()) {
      pageState = "ERROR";
      sessionState = "OK";
    } else if (blankPage()) {
      pageState = "BLANK";
      sessionState = "OK";
    } else if (vtoContext()) {
      pageState = "VTO";
      sessionState = "OK";
    } else {
      pageState = "OTHER";
      sessionState = "OK";
    }

    const last = document.getElementById("vto-v4-lastcheck");
    const status = document.getElementById("vto-v4-status");
    const lastText = last?.textContent?.trim() || "";
    const statusText = norm(status?.textContent || "");
    if (lastText && lastText !== "--" && lastText !== lastCheckText) {
      lastCheckText = lastText;
      lastScanAt = Date.now();
      if (pageState === "VTO") lastHealthyScanAt = lastScanAt;
    }
    if (statusText.includes("refreshing") && !lastStatusText.includes("refreshing")) lastRefreshAt = Date.now();
    lastStatusText = statusText;
  }
  function render() {
    if (!ensureHealthStrip()) return;
    detectHealth();
    const pageMap = {
      VTO:["VTO page","good"], OTHER:["A to Z","warn"], LOGIN:["Sign in","bad"],
      ERROR:["Error","bad"], BLANK:["Blank","bad"], CHECKING:["Checking","busy"]
    };
    const sessionMap = { OK:["Healthy","good"], PROMPT:["Prompt","warn"], AUTH:["Sign in","bad"] };
    const p = pageMap[pageState] || pageMap.CHECKING;
    const ss = sessionMap[sessionState] || ["Unknown","warn"];
    setChip(ui.page, p[0], p[1]);
    setChip(ui.session, ss[0], ss[1]);

    if (storageState.paused) setChip(ui.scan, "Paused", "warn");
    else if (!storageState.armed) setChip(ui.scan, "Idle", "busy");
    else if (lastStatusText.includes("refreshing")) setChip(ui.scan, "Refresh", "busy");
    else if (lastHealthyScanAt) setChip(ui.scan, "OK " + age(lastHealthyScanAt), "good");
    else setChip(ui.scan, "Waiting", "warn");
  }
  function snapshot() {
    detectHealth();
    return {
      ok:true,
      version:chrome.runtime.getManifest().version,
      pageState, sessionState,
      armed:!!storageState.armed,
      paused:!!storageState.paused,
      scanning:storageState.armed && !storageState.paused && Date.now() - lastScanAt < 1800,
      refreshing:lastStatusText.includes("refreshing"),
      lastScanAt, lastHealthyScanAt, lastRefreshAt,
      duplicateBlocks
    };
  }

  document.addEventListener("click", event => {
    const el = event.target?.closest?.('[data-vto-engine-action="1"]');
    if (!el) return;
    const card = el.closest("article,li,section,[role='dialog']") || el.parentElement;
    const context = norm(card?.innerText || "").slice(0, 180);
    const sig = textOf(el) + "|" + context;
    const now = Date.now();
    if (sig && sig === lastEngineAction && now - lastEngineActionAt < 4500) {
      duplicateBlocks++;
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    lastEngineAction = sig;
    lastEngineActionAt = now;
  }, true);

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "watcherHealth") {
      sendResponse(snapshot());
      return true;
    }
  });

  const observer = new MutationObserver(() => render());
  observer.observe(document.documentElement, {childList:true,subtree:true,characterData:true});
  setInterval(render, 750);
  render();
})();