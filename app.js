const RELEASE_FEED = "https://raw.githubusercontent.com/user1242151321/test/main/updates/latest.json";
const FALLBACK_VERSION = "4.2.6";
const FALLBACK_DOWNLOAD = "https://raw.githubusercontent.com/user1242151321/test/main/updates/VTO_Watcher_4.2.6.zip";

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

function setReleaseUI(version, downloadUrl, message, live = true) {
  const versionText = `v${version || FALLBACK_VERSION}`;
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
