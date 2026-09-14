# VTO Watcher 4.6.5

This release hardens the existing 4.6.4 watcher without changing its panel markup, CSS, popup, proportions, or licensing behavior.

- One scoped session handler recognizes visible continuation prompts and safe controls, with bounded retries. Password, MFA, CAPTCHA and login-required states block actions. Clicking continuation is recorded separately from prompt dismissal; neither proves the server extended its session.
- Offer boundaries count repeated time ranges individually, including identical times on neighboring cards. Hidden filled labels are excluded. Disabled, ambiguous, contradictory and unrecognized cards cannot trigger acceptance.
- A selected offer starts a transaction before its click. Refreshes remain blocked through confirmation and verification. A timeout pauses the watcher rather than repeating a possibly submitted action. A non-sensitive pending flag survives a page reload and pauses an interrupted attempt.
- Confirmation requires the selected offer plus scoped VTO context. Accessible button labels, role buttons and bounded Next/Continue steps are supported. Only a newly visible, positive VTO acceptance message can count as success; old messages, disappearing cards and filled states cannot.
- Copy Diagnostics includes bounded, sequenced DETECT, OPEN, CONFIRM, VERIFY, SESSION and REFRESH events with attempt IDs. URL query strings are excluded. No Amazon credentials, cookies or tokens are read or stored.
- The five-second minimum refresh remains enforced. Navigation uses named Schedule/VTO/menu controls; there are no coordinate guesses or forced reloads.

## Validation

Run `npm ci` then `npm test` for the deterministic jsdom/fake-clock fixture suite. `node tests/browser-check.cjs` checks the real rendered panel against source commit d31896c42ef4d0911ed469d41c6ea775d43f5613, and exercises a mixed-card acceptance flow in Chromium. On Windows it uses installed Chrome; elsewhere install Playwright Chromium first. Set VTO_CHROME_PATH to override the executable. Git history must contain the baseline commit.

20 fixture tests and the Chromium check passed locally before packaging. CI repeats the checks on source pushes. All CSS and popup files are unchanged. The release ZIP contains only active extension files and installation instructions; its contents are compared byte-for-byte with the validated source before publishing.

## Install and live check

1. Pull the private source and reload the existing unpacked extension, or extract the new ZIP over the existing unpacked extension folder and reload it in chrome://extensions.
2. Close old A to Z tabs and reopen one VTO tab so old injected scripts are removed. Confirm version 4.6.5 in the extension popup or Copy Diagnostics. The preserved panel theme has an older decorative version badge.
3. Sign in manually, keep the computer awake and Chrome running, and check the VTO page is loaded. Choose the intended filters, Auto Confirm ON and Test Mode OFF, then arm. Keep notifications enabled.
4. If the watcher pauses with an uncertain/interrupted acceptance, inspect Amazon's schedule/acceptance state before disarming and rearming. Do not treat a click or a notification as stronger evidence than Amazon's displayed result.

## Remaining live risk

These fixtures are mocked; no real Amazon VTO was accepted during validation. Amazon can change DOM, labels, authentication rules or success wording; closed shadow DOM, inaccessible frames, cross-domain sign-in redirects, sleeping/discarded tabs, network delays and already-claimed offers remain risks. Session continuation cannot override server-enforced expiry. Use one armed A to Z tab; cross-tab coordination is not provided. An unrecognized state deliberately pauses or remains unknown rather than guessing an action. No guarantee of VTO availability, acceptance or uninterrupted login is made.
