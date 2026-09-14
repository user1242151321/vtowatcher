# VTO Watcher 4.6.6 — refresh regression hotfix

4.6.5 mistakenly blocked all dialogs and excluded navigation controls inside them. A to Z navigation drawers implemented as dialogs could therefore stop the refresh cycle at 1s until manually closed. It also did not reopen a drawer that closed when Schedule was selected.

4.6.6 distinguishes navigation drawers from blocking dialogs, supports navigation menuitem/link/tab controls, and restores the sequential menu → Schedule → reopen menu if needed → VTO flow. Each asynchronous step rechecks session, pause and acceptance state. Actual session/confirmation dialogs and pending acceptance transactions still block refresh. The minimum interval remains five seconds. No CSS, popup or panel markup changed.

Validation: both new drawer regression tests failed against 4.6.5 and pass with this fix. The full suite has 22 deterministic tests. Chromium additionally checks repeated refresh with an initially open modal drawer that closes after each navigation selection, alongside the prior acceptance and panel layout checks.

Install: pull the source, reload the extension, and refresh or reopen A to Z to replace the old injected engine. Confirm 4.6.6 in the popup or Copy Diagnostics. ZIP users should replace their existing unpacked extension files before reloading.

These are mocked pages, not a live Amazon acceptance test. Server-enforced login, changed markup, sleeping tabs, network delays and offer availability remain live risks. No credentials, cookies or authentication tokens are read or stored; password/MFA/CAPTCHA are not bypassed.
