'use strict';

const normalLevel = 100;
const maxLevel = 600;
const storageKey = 'tabLevels';
const levels = new Map();

let hydrated = false;

function isValidLevel(value) {
  return Number.isInteger(value) && value >= 0 && value <= maxLevel;
}

function getOrigin(url) {
  if (!url) return '';
  try {
    const origin = new URL(url).origin;
    return origin === 'null' ? '' : origin;
  } catch {
    return '';
  }
}

function setHeader(headers, name, value) {
  const lower = name.toLowerCase();
  let updated = false;
  for (let i = headers.length - 1; i >= 0; i -= 1) {
    if (headers[i].name.toLowerCase() === lower) {
      if (!updated) {
        headers[i].value = value;
        updated = true;
      } else {
        headers.splice(i, 1);
      }
    }
  }
  if (!updated) headers.push({ name, value });
}

function ensureVaryOrigin(headers) {
  const existing = headers.find((header) => header.name.toLowerCase() === 'vary');
  if (!existing) {
    headers.push({ name: 'Vary', value: 'Origin' });
    return;
  }
  const tokens = existing.value.split(',').map((token) => token.trim().toLowerCase());
  if (!tokens.includes('*') && !tokens.includes('origin')) {
    existing.value = `${existing.value}, Origin`;
  }
}

async function saveLevels() {
  try {
    await browser.storage.session.set({ [storageKey]: Object.fromEntries(levels) });
  } catch {
    // Keep in-memory state working even if session storage is unavailable.
  }
}

async function updateBadge(tabId, value) {
  try {
    if (value === normalLevel) {
      await browser.action.setBadgeText({ tabId, text: '' });
      return;
    }
    await browser.action.setBadgeBackgroundColor({ tabId, color: '#2456a3' });
    await browser.action.setBadgeTextColor({ tabId, color: '#ffffff' });
    await browser.action.setBadgeText({ tabId, text: `${value}%` });
  } catch {
    // Ignore tabs that closed before the badge update finished.
  }
}

const ready = browser.storage.session
  .get(storageKey)
  .then((data) => {
    const saved = data[storageKey];
    if (!saved || typeof saved !== 'object') return;
    for (const [id, value] of Object.entries(saved)) {
      const tabId = Number(id);
      if (Number.isInteger(tabId) && isValidLevel(value) && value !== normalLevel) {
        levels.set(tabId, value);
      }
    }
  })
  .catch(() => {})
  .finally(() => {
    hydrated = true;
  });

function handleHeaders(details) {
  if (details.tabId < 0) return;

  const requestOrigin = getOrigin(details.originUrl || details.documentUrl);
  const mediaOrigin = getOrigin(details.url);
  if (!requestOrigin || !mediaOrigin || requestOrigin === mediaOrigin) return;

  const headers = details.responseHeaders || [];
  // Keep non-CORS and CORS cache entries separate so reloading with crossOrigin hits the network.
  ensureVaryOrigin(headers);

  if (levels.has(details.tabId)) {
    setHeader(headers, 'Access-Control-Allow-Origin', requestOrigin);
    setHeader(headers, 'Access-Control-Allow-Credentials', 'true');
  }

  return { responseHeaders: headers };
}

browser.webRequest.onHeadersReceived.addListener(
  (details) => (hydrated ? handleHeaders(details) : ready.then(() => handleHeaders(details))),
  { urls: ['http://*/*', 'https://*/*'], types: ['media'] },
  ['blocking', 'responseHeaders']
);

browser.tabs.onRemoved.addListener(async (tabId) => {
  await ready;
  if (!levels.delete(tabId)) return;
  await saveLevels();
});

browser.runtime.onMessage.addListener((message, sender) => {
  if (!message || typeof message !== 'object') return;

  if (message.type === 'get-level') {
    const tabId = Number.isInteger(message.tabId) ? message.tabId : sender.tab?.id;
    if (!Number.isInteger(tabId)) return Promise.resolve({ level: normalLevel });

    return ready.then(async () => {
      const level = levels.get(tabId) ?? normalLevel;
      if (sender.frameId === 0 && level !== normalLevel) await updateBadge(tabId, level);
      return { level };
    });
  }

  if (message.type === 'set-level') {
    const tabId = message.tabId;
    const value = message.level;
    if (!Number.isInteger(tabId) || !isValidLevel(value)) return;

    return ready.then(async () => {
      if (value === normalLevel) levels.delete(tabId);
      else levels.set(tabId, value);

      await Promise.all([
        saveLevels(),
        updateBadge(tabId, value),
        browser.tabs.sendMessage(tabId, { type: 'set-level', level: value }).catch(() => {}),
      ]);
      return { level: value };
    });
  }
});
