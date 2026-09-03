(() => {
  "use strict";

  if (window.__VTO_WATCHER_434_ACCEPT_PATCH__) return;
  window.__VTO_WATCHER_434_ACCEPT_PATCH__ = true;

  const normalize = text => String(text || "").replace(/\s+/g, " ").trim().toLowerCase();
  const LAST_ACTION_KEY = "vto434LastActionAt";
  const PENDING_KEY = "vto434PendingFlowAt";

  let acting = false;

  function visible(el) {
    if (!el || !(el instanceof Element)) return false;
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity || 1) > 0 && r.width > 0 && r.height > 0;
  }

  function textOf(el) {
    if (!el) return "";
    return normalize(el.innerText || el.textContent || el.value || el.getAttribute?.("aria-label") || el.getAttribute?.("title") || "");
  }

  function pageText() {
    const root = document.querySelector("main,[role='main'],#root,#app") || document.body;
    return normalize(root?.innerText || root?.textContent || "");
  }

  function isVtoContext() {
    const t = pageText();
    return location.pathname.toLowerCase().includes("voluntary_time_off") ||
      t.includes("voluntary time off") || t.includes("accepting voluntary time off") ||
      t.includes("vto filled") || t.includes("vto accepted");
  }

  function hasTimeRange(text) {
    return /\b\d{1,2}:\d{2}\s*(?:am|pm)\s*-\s*\d{1,2}:\d{2}\s*(?:am|pm)\b/i.test(String(text || ""));
  }

  function unavailable(text) {
    const t = normalize(text);
    return [
      "vto filled", "vto full", "opportunity filled", "no longer available",
      "unavailable", "expired", "already accepted", "previously accepted",
      "you accepted", "vto accepted"
    ].some(x => t.includes(x));
  }

  function parseClockMinutes(raw) {
    const m = String(raw || "").match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
    if (!m) return null;
    let h = Number(m[1]);
    const min = Number(m[2]);
    const ap = m[3].toLowerCase();
    if (h === 12) h = 0;
    if (ap === "pm") h += 12;
    return h * 60 + min;
  }

  function parseRange(text) {
    const m = String(text || "").match(/(\d{1,2}:\d{2}\s*(?:am|pm))\s*-\s*(\d{1,2}:\d{2}\s*(?:am|pm))/i);
    if (!m) return null;
    const start = parseClockMinutes(m[1]);
    let end = parseClockMinutes(m[2]);
    if (start == null || end == null) return null;
    if (end <= start) end += 1440;
    return { startMinutes: start, hours: (end - start) / 60 };
  }

  function parseHours(text) {
    const h = String(text || "").match(/(\d+(?:\.\d+)?)\s*hrs?/i);
    const m = String(text || "").match(/(\d+)\s*mins?/i);
    let hours = 0;
    if (h) hours += Number(h[1]);
    if (m) hours += Number(m[1]) / 60;
    if (hours > 0) return hours;
    return parseRange(text)?.hours || 0;
  }

  function smallestOfferCards() {
    const candidates = [...document.querySelectorAll("div,section,article,li")]
      .filter(visible)
      .filter(el => hasTimeRange(el.innerText || "") && normalize(el.innerText || "").length < 2600)
      .filter(el => !el.closest?.("#vto-v4-panel"));

    return candidates.filter(el => ![...el.children].some(child => hasTimeRange(child.innerText || "")));
  }

  function expandCard(seed) {
    let current = seed;
    let best = seed;
    for (let i = 0; i < 8 && current && current !== document.body; i++) {
      const raw = current.innerText || "";
      if (!hasTimeRange(raw)) {
        current = current.parentElement;
        continue;
      }
      if (normalize(raw).length < 2600) best = current;
      const clickable = [...current.querySelectorAll('button,a,[role="button"],[tabindex]')].filter(visible);
      if (clickable.length || unavailable(raw)) return current;
      current = current.parentElement;
    }
    return best;
  }

  function cardInfo(card) {
    const raw = card?.innerText || "";
    const range = parseRange(raw);
    return {
      card,
      raw,
      unavailable: unavailable(raw),
      hours: parseHours(raw),
      startMinutes: range?.startMinutes ?? null
    };
  }

  function eligibleCards(state) {
    const unique = [...new Set(smallestOfferCards().map(expandCard).filter(Boolean))]
      .map(cardInfo)
      .filter(x => !x.unavailable)
      .filter(x => Number(state.minHours || 0) <= 0 || x.hours >= Number(state.minHours || 0))
      .filter(x => state.startAfter === "any" || x.startMinutes == null || x.startMinutes >= Number(state.startAfter));

    if (state.preferLongest) unique.sort((a, b) => (b.hours || 0) - (a.hours || 0));
    return unique;
  }

  function clickables(root = document) {
    return [...root.querySelectorAll('button,a,[role="button"],input[type="button"],input[type="submit"],[tabindex]')]
      .filter(visible)
      .filter(el => !el.closest?.("#vto-v4-panel"));
  }

  function findCardAction(card) {
    const direct = ["accept", "claim", "take vto", "request vto", "get vto", "request"];
    const openers = ["select", "continue", "view", "details", "open"];
    const els = clickables(card);

    let found = els.find(el => {
      const t = textOf(el);
      return direct.some(x => t === x || t.includes(`${x} `) || t.includes(` ${x}`));
    });
    if (found) return found;

    return els.find(el => {
      const t = textOf(el);
      return openers.some(x => t === x || t.startsWith(`${x} `));
    }) || null;
  }

  function findConfirm() {
    return clickables().find(el => {
      const t = textOf(el);
      return t === "confirm" || t === "confirm vto" || t.includes("confirm accept") ||
        t.includes("confirm acceptance") || t === "yes, accept" || t === "yes accept";
    }) || null;
  }

  function status(message, color = "#b45309") {
    const el = document.getElementById("vto-v4-status");
    if (!el) return;
    el.textContent = message;
    el.style.background = color;
  }

  async function clickAction(el, message) {
    if (!el || acting) return false;
    acting = true;
    try {
      el.setAttribute("data-vto-live-offer-action", "1");
      sessionStorage.setItem(LAST_ACTION_KEY, String(Date.now()));
      sessionStorage.setItem(PENDING_KEY, String(Date.now()));
      status(message);
      el.scrollIntoView({ block: "center", behavior: "auto" });
      el.click();
      return true;
    } finally {
      setTimeout(() => {
        try { el.removeAttribute("data-vto-live-offer-action"); } catch (_) {}
        acting = false;
      }, 900);
    }
  }

  async function tick() {
    if (acting || !isVtoContext()) return;

    let state;
    try {
      state = await chrome.storage.local.get({
        armed: false,
        paused: false,
        autoConfirm: false,
        minHours: 0,
        startAfter: "any",
        preferLongest: true
      });
    } catch (_) {
      return;
    }

    if (!state.armed || state.paused) return;

    const last = Number(sessionStorage.getItem(LAST_ACTION_KEY) || 0);
    if (last && Date.now() - last < 1400) return;

    const pendingAt = Number(sessionStorage.getItem(PENDING_KEY) || 0);
    if (state.autoConfirm && pendingAt && Date.now() - pendingAt < 30000) {
      const confirm = findConfirm();
      if (confirm) {
        await clickAction(confirm, "Confirming VTO...");
        return;
      }
    }

    const best = eligibleCards(state)[0];
    if (!best) return;

    const action = findCardAction(best.card);
    if (action) {
      await clickAction(action, "VTO FOUND — opening offer...");
    } else {
      status("VTO FOUND — action button not recognized", "#b45309");
    }
  }

  setInterval(tick, 250);
})();
