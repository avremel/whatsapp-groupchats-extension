// Minimal service worker to keep the extension registered.
// All logic lives in content.js; storage is accessed directly via chrome.storage.local.
chrome.runtime.onInstalled.addListener(() => {
  console.log('WhatsApp Group Chat Scroller installed');
});
