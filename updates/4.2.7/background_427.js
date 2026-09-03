const VTO_OLD_RELEASE_FEED = "https://raw.githubusercontent.com/user1242151321/test/main/updates/latest.json";
const VTO_NEW_RELEASE_FEED = "https://raw.githubusercontent.com/user1242151321/vtowatcher/main/updates/latest.json";
const vtoOriginalFetch = globalThis.fetch.bind(globalThis);

globalThis.fetch = (input, init) => {
  const url = typeof input === "string" ? input : String(input?.url || "");
  if (url === VTO_OLD_RELEASE_FEED) {
    return vtoOriginalFetch(VTO_NEW_RELEASE_FEED, init);
  }
  return vtoOriginalFetch(input, init);
};

importScripts("background.js");
