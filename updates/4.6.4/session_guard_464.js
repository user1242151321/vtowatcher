(() => {
  "use strict";
  if (window.__VTO_SESSION_GUARD_464__) return;
  window.__VTO_SESSION_GUARD_464__ = true;

  const norm = s => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
  const visible = el => {
    if (!el || !(el instanceof Element)) return false;
    const st = getComputedStyle(el), r = el.getBoundingClientRect();
    return st.display !== "none" && st.visibility !== "hidden" && Number(st.opacity || 1) > 0 && r.width > 0 && r.height > 0;
  };
  const textOf = el => norm(el?.innerText || el?.textContent || el?.value || el?.getAttribute?.("aria-label") || el?.getAttribute?.("title") || "");

  const SESSION_PHRASES = [
    "are you still there",
    "you will automatically be logged out",
    "stay logged in",
    "stay signed in",
    "keep me logged in",
    "keep me signed in",
    "session will expire",
    "session is about to expire",
    "continue session",
    "continue your session"
  ];
  const AUTH_PHRASES = [
    "enter your password",
    "verification code",
    "one-time password",
    "one time password",
    "two-step verification",
    "two factor",
    "security code",
    "authenticator code",
    "sign in to continue"
  ];
  const SAFE_BUTTONS = [
    "stay logged in",
    "stay signed in",
    "keep me logged in",
    "keep me signed in",
    "continue session",
    "continue",
    "i'm still here",
    "i’m still here",
    "still here",
    "keep working",
    "continue working",
    "extend session",
    "remain signed in"
  ];

  let lastClickAt = 0;
  let lastAuthNoticeAt = 0;
  let busy = false;

  function roots() {
    const out = [document];
    const stack = [document.documentElement];
    const seen = new Set();
    while (stack.length) {
      const node = stack.pop();
      if (!node || seen.has(node)) continue;
      seen.add(node);
      if (node.shadowRoot) {
        out.push(node.shadowRoot);
        stack.push(...node.shadowRoot.querySelectorAll("*"));
      }
      if (node.querySelectorAll) stack.push(...node.querySelectorAll("*"));
      if (seen.size > 6000) break;
    }
    return out;
  }

  function rootText(root) {
    if (root === document) return norm(document.body?.innerText || document.body?.textContent || "");
    return norm(root.textContent || "");
  }

  function hasSessionPrompt(root) {
    const t = rootText(root);
    if (!t) return false;
    return SESSION_PHRASES.some(p => t.includes(p));
  }

  function requiresAuth(root) {
    const t = rootText(root);
    if (AUTH_PHRASES.some(p => t.includes(p))) return true;
    const pwd = root.querySelector?.('input[type="password"],input[autocomplete="one-time-code"]');
    return !!(pwd && visible(pwd));
  }

  function safeButton(root) {
    const els = [...root.querySelectorAll('button,[role="button"],input[type="button"],input[type="submit"],a')]
      .filter(visible)
      .filter(el => !el.disabled && norm(el.getAttribute?.("aria-disabled") || "") !== "true");
    return els.find(el => {
      const t = textOf(el);
      return SAFE_BUTTONS.some(k => t === k || t.startsWith(k + " "));
    }) || null;
  }

  async function notifyAuthRequired() {
    const now = Date.now();
    if (now - lastAuthNoticeAt < 60000) return;
    lastAuthNoticeAt = now;
    try {
      await chrome.runtime.sendMessage({
        type: "notify",
        title: "VTO Watcher",
        message: "Amazon A to Z requires you to sign in again. VTO Watcher will not enter passwords or verification codes."
      });
    } catch (_) {}
  }

  async function check() {
    if (busy) return;
    busy = true;
    try {
      for (const root of roots()) {
        if (!hasSessionPrompt(root)) continue;
        if (requiresAuth(root)) {
          console.warn("[VTO Watcher 4.6.4] Amazon requires re-authentication; session guard will not bypass it.");
          await notifyAuthRequired();
          return;
        }
        const btn = safeButton(root);
        if (!btn) continue;
        const now = Date.now();
        if (now - lastClickAt < 4000) return;
        lastClickAt = now;
        try {
          btn.setAttribute("data-vto-session-guard", "1");
          btn.scrollIntoView({block:"center", behavior:"auto"});
          btn.focus?.({preventScroll:true});
          await new Promise(r => setTimeout(r, 60));
          HTMLElement.prototype.click.call(btn);
          console.info("[VTO Watcher 4.6.4] Continued existing Amazon session via:", textOf(btn));
          setTimeout(() => { try { btn.removeAttribute("data-vto-session-guard"); } catch (_) {} }, 1000);
        } catch (e) {
          console.warn("[VTO Watcher 4.6.4] Session continuation click failed:", e);
        }
        return;
      }
    } finally {
      busy = false;
    }
  }

  const observer = new MutationObserver(() => check());
  observer.observe(document.documentElement, {childList:true, subtree:true, characterData:true});
  setInterval(check, 400);
  check();
})();
