'use strict';

const normalLevel = 100;
const slider = document.getElementById('level');
const valueOutput = document.getElementById('value');
const resetButton = document.getElementById('reset');
const statusElement = document.getElementById('status');
const frameStatuses = new Map();

let activeTabId;
let currentLevel = normalLevel;
let unavailablePage = false;

function renderLevel(value) {
  currentLevel = value;
  slider.value = value;
  slider.setAttribute('aria-valuetext', `${value}%`);
  valueOutput.value = `${value}%`;
  resetButton.disabled = unavailablePage || value === normalLevel;
}

function renderStatus() {
  if (unavailablePage) {
    statusElement.textContent = 'Unavailable on this page.';
    return;
  }

  let playing = 0;
  let compatible = 0;
  let restrictedAfterRouting = false;
  let suspended = false;

  for (const frame of frameStatuses.values()) {
    playing += frame.playing;
    compatible += frame.compatible;
    restrictedAfterRouting ||= frame.restrictedAfterRouting;
    suspended ||= frame.suspended;
  }

  let message = '';
  if (restrictedAfterRouting) {
    message = 'A player switched to restricted audio. Reload the page to restore native playback.';
  } else if (!playing) {
    message = 'Start audio or video to hear the adjustment.';
  } else if (!compatible) {
    message = 'Audio from this player is unavailable to the extension.';
  } else if (currentLevel !== normalLevel && suspended) {
    message = 'Click the player to enable audio processing.';
  }
  statusElement.textContent = message;
}

function setLevel(value) {
  renderLevel(value);
  renderStatus();
  if (!Number.isInteger(activeTabId)) return;
  browser.runtime.sendMessage({ type: 'set-level', tabId: activeTabId, level: value }).catch(() => {});
}

browser.runtime.onMessage.addListener((message, sender) => {
  if (!message || message.type !== 'frame-status') return;
  if (sender.tab?.id !== activeTabId) return;

  frameStatuses.set(sender.frameId ?? 0, message);
  renderStatus();
});

slider.addEventListener('input', () => setLevel(slider.valueAsNumber));
resetButton.addEventListener('click', () => setLevel(normalLevel));

async function init() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab || !Number.isInteger(tab.id)) {
    unavailablePage = true;
    slider.disabled = true;
    renderLevel(normalLevel);
    renderStatus();
    return;
  }

  activeTabId = tab.id;
  const response = await browser.runtime
    .sendMessage({ type: 'get-level', tabId: activeTabId })
    .catch(() => null);
  renderLevel(response?.level ?? normalLevel);

  try {
    await browser.tabs.sendMessage(activeTabId, { type: 'query-status' });
    slider.focus();
  } catch {
    unavailablePage = true;
    slider.disabled = true;
    renderLevel(currentLevel);
    renderStatus();
  }
}

void init();
