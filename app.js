const RELEASE_FEED = "https://raw.githubusercontent.com/user1242151321/vtowatcher/main/updates/latest.json";
const FALLBACK_VERSION = "4.5.0";
const FALLBACK_DOWNLOAD = "https://raw.githubusercontent.com/user1242151321/vtowatcher/main/updates/VTO_Watcher_4.5.0.zip";
const FALLBACK_SHA = "";

const menuButton = document.getElementById("menuButton");
const navLinks = document.getElementById("navLinks");
const header = document.querySelector(".site-header");
const year = document.getElementById("year");
const checksumEl = document.getElementById("releaseChecksum");
const copyChecksum = document.getElementById("copyChecksum");

if (year) year.textContent = new Date().getFullYear();
if (menuButton && navLinks) {
  menuButton.addEventListener("click", () => {
    const open = navLinks.classList.toggle("open");
    menuButton.setAttribute("aria-expanded", String(open));
  });
  navLinks.querySelectorAll("a").forEach(link => link.addEventListener("click", () => {
    navLinks.classList.remove("open");
    menuButton.setAttribute("aria-expanded", "false");
  }));
}
window.addEventListener("scroll", () => { if (header) header.classList.toggle("scrolled", window.scrollY > 12); }, { passive: true });
const observer = new IntersectionObserver(entries => entries.forEach(entry => {
  if (entry.isIntersecting) { entry.target.classList.add("visible"); observer.unobserve(entry.target); }
}), { threshold: 0.12 });
document.querySelectorAll(".reveal").forEach(el => observer.observe(el));

function updateChangelog(version) {
  const first = document.querySelector("#changelog .timeline-item:first-child");
  if (!first) return;
  const title = first.querySelector("h3");
  const label = first.querySelector(".timeline-top span");
  const copy = first.querySelector("p");
  if (title) title.textContent = `Version ${version || FALLBACK_VERSION}`;
  if (label) label.textContent = "Current";
  if (copy) copy.textContent = "One unified watcher engine replaces the old patch stack, with persistent runtime, safer soft refresh, verified offer actions, stronger diagnostics, responsive sizing, and clearer status colors.";
}
function setReleaseUI(version, downloadUrl, message, sha256, live = true) {
  const actualVersion = version || FALLBACK_VERSION;
  const versionText = `v${actualVersion}`;
  const url = downloadUrl || FALLBACK_DOWNLOAD;
  const heroVersion = document.getElementById("heroVersion");
  const latestVersionBadge = document.getElementById("latestVersionBadge");
  const releaseStatus = document.getElementById("releaseStatus");
  const releaseMessage = document.getElementById("releaseMessage");
  if (heroVersion) heroVersion.textContent = versionText;
  if (latestVersionBadge) latestVersionBadge.textContent = versionText;
  if (releaseStatus) releaseStatus.textContent = live ? "Live GitHub release feed" : "Using built-in release fallback";
  if (releaseMessage && message) releaseMessage.textContent = message;
  if (checksumEl) checksumEl.textContent = sha256 || "Checksum will appear when the release feed finishes publishing.";
  updateChangelog(actualVersion);
  ["downloadButton","heroDownload","bottomDownload"].map(id=>document.getElementById(id)).forEach(button => {
    if (!button) return;
    button.href = url;
    button.target = "_blank";
    button.rel = "noopener";
  });
}
copyChecksum?.addEventListener("click", async () => {
  const value = checksumEl?.textContent?.trim() || "";
  if (!/^[a-f0-9]{64}$/i.test(value)) return;
  try { await navigator.clipboard.writeText(value); copyChecksum.textContent = "Copied"; setTimeout(()=>copyChecksum.textContent="Copy",1400); }
  catch { copyChecksum.textContent = "Failed"; }
});
async function loadLatestRelease() {
  try {
    const response = await fetch(RELEASE_FEED, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const release = await response.json();
    setReleaseUI(String(release.latestVersion || FALLBACK_VERSION).trim(), String(release.downloadUrl || FALLBACK_DOWNLOAD).trim(), String(release.message || "The current GitHub release is ready to download.").trim(), String(release.sha256 || "").trim(), true);
  } catch {
    setReleaseUI(FALLBACK_VERSION, FALLBACK_DOWNLOAD, "The current release is ready to download. Live release information could not be loaded right now.", FALLBACK_SHA, false);
  }
}
loadLatestRelease();
