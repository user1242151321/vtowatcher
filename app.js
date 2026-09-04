const RELEASE_FEED = "https://raw.githubusercontent.com/user1242151321/vtowatcher/main/updates/latest.json";
const FALLBACK_VERSION = "4.4.2";
const FALLBACK_DOWNLOAD = "https://vtowatcher.pages.dev/download-4.4.2.html";

const menuButton = document.getElementById("menuButton");
const navLinks = document.getElementById("navLinks");
const header = document.querySelector(".site-header");
const year = document.getElementById("year");

if (year) year.textContent = new Date().getFullYear();

if (menuButton && navLinks) {
  menuButton.addEventListener("click", () => {
    const open = navLinks.classList.toggle("open");
    menuButton.setAttribute("aria-expanded", String(open));
  });
  navLinks.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
      navLinks.classList.remove("open");
      menuButton.setAttribute("aria-expanded", "false");
    });
  });
}

window.addEventListener("scroll", () => {
  if (header) header.classList.toggle("scrolled", window.scrollY > 12);
}, { passive: true });

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add("visible");
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

document.querySelectorAll(".reveal").forEach(el => observer.observe(el));

function updateChangelog(version) {
  const first = document.querySelector("#changelog .timeline-item:first-child");
  if (!first) return;
  const title = first.querySelector("h3");
  const label = first.querySelector(".timeline-top span");
  const copy = first.querySelector("p");
  if (title) title.textContent = `Version ${version || FALLBACK_VERSION}`;
  if (label) label.textContent = "Current";
  if (copy) copy.textContent = "The license popup now matches the live watcher outline, removes the confusing LIVE badge, and balances License, Access, Expires, and Device into one cleaner four-part details panel.";
}

function setReleaseUI(version, downloadUrl, message, live = true) {
  const actualVersion = version || FALLBACK_VERSION;
  const versionText = `v${actualVersion}`;
  const url = downloadUrl || FALLBACK_DOWNLOAD;
  const heroVersion = document.getElementById("heroVersion");
  const latestVersionBadge = document.getElementById("latestVersionBadge");
  const releaseStatus = document.getElementById("releaseStatus");
  const releaseMessage = document.getElementById("releaseMessage");
  const downloadButton = document.getElementById("downloadButton");
  const heroDownload = document.getElementById("heroDownload");
  const bottomDownload = document.getElementById("bottomDownload");
  if (heroVersion) heroVersion.textContent = versionText;
  if (latestVersionBadge) latestVersionBadge.textContent = versionText;
  if (releaseStatus) releaseStatus.textContent = live ? "Live GitHub release feed" : "Using built-in release fallback";
  if (releaseMessage && message) releaseMessage.textContent = message;
  updateChangelog(actualVersion);
  [downloadButton, heroDownload, bottomDownload].forEach(button => {
    if (!button) return;
    button.href = url;
    button.target = "_blank";
    button.rel = "noopener";
  });
}

async function loadLatestRelease() {
  try {
    const response = await fetch(RELEASE_FEED, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const release = await response.json();
    setReleaseUI(
      String(release.latestVersion || FALLBACK_VERSION).trim(),
      String(release.downloadUrl || FALLBACK_DOWNLOAD).trim(),
      String(release.message || "The current GitHub release is ready to download.").trim(),
      true
    );
  } catch (error) {
    setReleaseUI(FALLBACK_VERSION, FALLBACK_DOWNLOAD, "The current release is ready to download. Live release information could not be loaded right now.", false);
  }
}

loadLatestRelease();
