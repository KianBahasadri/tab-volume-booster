// ==UserScript==
// @name         Tab Volume Booster
// @namespace    https://github.com/KianBahasadri/tab-volume-booster
// @version      1.1.0
// @description  Adjust the volume of compatible web audio and video players from 0% to 600%.
// @match        https://*/*
// @match        http://*/*
// @run-at       document-idle
// @sandbox      DOM
// @grant        GM_registerMenuCommand
// @grant        GM.getTab
// @grant        GM.saveTab
// @downloadURL  none
// ==/UserScript==

(() => {
  'use strict';

  const normalLevel = 100;
  const maxLevel = 600;
  const pageWindow = document.defaultView;
  const topFrame = pageWindow === pageWindow.top;
  const refreshLevelMessage = 'tab-volume-booster:refresh-level';
  const openPanelMessage = 'tab-volume-booster:open-panel';
  const mediaEvents = ['playing', 'loadeddata', 'pause', 'ended', 'emptied', 'encrypted'];
  const players = new Set();
  const watchedRoots = new WeakSet();
  const routed = new WeakSet();
  const unavailable = new WeakSet();
  const encrypted = new WeakSet();

  let level = normalLevel;
  let audioContext;
  let gain;
  let panel;
  let pendingLevel;
  let savingLevel = false;
  let levelRead = 0;
  let readScheduled = false;

  function canRoute(player) {
    if (player.mediaKeys || encrypted.has(player) || player.sinkId || unavailable.has(player)) {
      return false;
    }

    if (player.srcObject instanceof MediaStream) return true;
    if (!player.currentSrc) return false;

    const url = new URL(player.currentSrc);
    return url.protocol === 'data:' || url.origin === location.origin || player.crossOrigin !== null;
  }

  function route(player) {
    // Firefox can allow another source node on a player already routed through Web Audio.
    if (player.mozAudioCaptured) {
      unavailable.add(player);
      return;
    }

    try {
      audioContext.createMediaElementSource(player).connect(gain);
      routed.add(player);
    } catch {
      // Encrypted media and players with an existing source node can reject the connection.
      unavailable.add(player);
    }
  }

  function refreshPlayers() {
    let playing = 0;
    let compatible = 0;
    let restrictedAfterRouting = false;

    for (const player of players) {
      if (!player.isConnected) {
        players.delete(player);
        continue;
      }
      if (player.paused || player.ended || player.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        continue;
      }

      playing += 1;
      if (!canRoute(player)) {
        restrictedAfterRouting ||= routed.has(player);
        continue;
      }
      if (level !== normalLevel && !routed.has(player)) {
        if (!audioContext) startAudio();
        if (audioContext.state === 'running') route(player);
      }
      if (!unavailable.has(player)) compatible += 1;
    }

    if (!panel) return;

    let message = '';
    if (restrictedAfterRouting) {
      message = 'The player switched to restricted audio. Reload the page to restore native playback.';
    } else if (!playing && pageWindow.length === 0) {
      message = 'Start audio or video to hear the adjustment.';
    } else if (playing && !compatible) {
      message = 'Audio from this player is unavailable to the script.';
    } else if (compatible && level !== normalLevel && audioContext?.state !== 'running') {
      message = 'Click the player to enable audio processing.';
    }
    if (panel.status.textContent !== message) panel.status.textContent = message;
  }

  function onMediaEvent(event) {
    const player = event.target;
    if (!(player instanceof HTMLMediaElement)) return;

    if (event.type === 'encrypted') encrypted.add(player);
    if (event.type === 'emptied') encrypted.delete(player);
    players.add(player);
    refreshPlayers();
  }

  function watchRoot(root) {
    watchedRoots.add(root);
    for (const type of mediaEvents) root.addEventListener(type, onMediaEvent, true);
    documentObserver.observe(root, { childList: true, subtree: true });
    findPlayers(root);
  }

  function findPlayers(root) {
    function inspect(element) {
      if (element instanceof HTMLMediaElement) players.add(element);
      const shadow = element.shadowRoot;
      if (shadow && element !== panel?.host && !watchedRoots.has(shadow)) watchRoot(shadow);
    }

    if (root instanceof Element) inspect(root);
    for (const element of root.querySelectorAll('*')) inspect(element);
  }

  const documentObserver = new MutationObserver((changes) => {
    let elementsChanged = false;
    for (const change of changes) {
      for (const node of change.addedNodes) {
        if (node instanceof Element && node.isConnected) {
          findPlayers(node);
          elementsChanged = true;
        }
      }
      if (change.removedNodes.length && players.size) elementsChanged = true;
    }
    if (elementsChanged) refreshPlayers();
  });

  function startAudio() {
    audioContext = new AudioContext();
    gain = audioContext.createGain();
    gain.gain.value = level / normalLevel;
    gain.connect(audioContext.destination);
    audioContext.addEventListener('statechange', refreshPlayers);
    resumeAudio();
  }

  function resumeAudio() {
    if (level !== normalLevel && audioContext?.state === 'suspended') {
      audioContext.resume().catch(refreshPlayers);
    }
  }

  function renderLevel() {
    if (!panel) return;
    panel.slider.value = level;
    panel.slider.setAttribute('aria-valuetext', `${level}%`);
    panel.value.value = `${level}%`;
    panel.reset.disabled = level === normalLevel;

  }

  function applyLevel(value) {
    if (level === value) return;
    level = value;
    if (level !== normalLevel && !watchedRoots.has(document)) watchRoot(document);
    renderLevel();

    if (gain) {
      const now = audioContext.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(level / normalLevel, now, 0.01);
    }
    refreshPlayers();
  }

  async function readTabLevel() {
    const request = ++levelRead;
    try {
      const tab = await GM.getTab();
      if (request !== levelRead) return;
      const value = tab?.volumeLevel ?? normalLevel;
      if (Number.isInteger(value) && value >= 0 && value <= maxLevel) applyLevel(value);
    } catch {
      // The local controls still work if Tampermonkey's tab data is unavailable.
    }
  }

  function notifyFrames(parent) {
    for (let index = 0; index < parent.length; index += 1) {
      const frame = parent[index];
      if (!frame) continue;
      frame.postMessage(refreshLevelMessage, '*');
      notifyFrames(frame);
    }
  }

  async function setTabLevel(value) {
    if (!Number.isInteger(value) || value < 0 || value > maxLevel) return;
    levelRead += 1;
    applyLevel(value);
    pendingLevel = value;
    if (savingLevel) return;

    savingLevel = true;
    try {
      while (pendingLevel !== undefined) {
        const nextLevel = pendingLevel;
        pendingLevel = undefined;
        await GM.saveTab({ volumeLevel: nextLevel });
        notifyFrames(pageWindow);
      }
    } catch {
      // Keep local playback usable if Tampermonkey cannot save the tab level.
    } finally {
      savingLevel = false;
    }
  }

  function buildPanel() {
    const host = document.createElement('div');
    host.setAttribute('popover', 'manual');
    host.setAttribute('data-tab-volume-booster', '');
    const shadow = host.attachShadow({ mode: 'open' });
    const styles = new CSSStyleSheet();
    styles.replaceSync(`
      :host {
        all: initial !important;
        position: fixed !important;
        inset: auto 12px 12px auto !important;
        width: min(288px, calc(100vw - 24px)) !important;
      }
      :host(:popover-open) { display: block !important; }
      :host(:not(:popover-open)) { display: none !important; }
      .panel {
        color-scheme: light dark;
        --border: light-dark(#aeb7c3, #50555f);
        --accent: light-dark(#2456a3, #a8c7ff);
        box-sizing: border-box;
        padding: 12px;
        border: 1px solid var(--border);
        border-radius: 10px;
        background: light-dark(#ffffff, #17191e);
        color: light-dark(#20242b, #fafafa);
        box-shadow: 0 4px 16px #0006;
        font: 14px/1.4 system-ui, sans-serif;
      }
      .row { display: flex; align-items: center; gap: 8px; }
      label { flex: 1; font-weight: 600; }
      output { font-variant-numeric: tabular-nums; }
      input { width: 100%; margin: 12px 0; accent-color: var(--accent); }
      button {
        border: 1px solid var(--border);
        border-radius: 5px;
        background: light-dark(#eef1f5, #22252c);
        color: inherit;
        padding: 3px 8px;
        font: inherit;
      }
      button:enabled { cursor: pointer; }
      button:enabled:hover { background: light-dark(#e1e6ed, #363c48); }
      button:disabled { opacity: 0.55; }
      :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
      [role=status] { color: light-dark(#4b5563, #d2d5de); font-size: 12px; }
    `);
    shadow.adoptedStyleSheets = [styles];

    const header = document.createElement('div');
    header.className = 'row';
    const label = document.createElement('label');
    label.htmlFor = 'level';
    label.textContent = 'Volume boost';
    const value = document.createElement('output');
    value.htmlFor.add('level');
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Close volume controls');
    close.addEventListener('click', () => host.hidePopover());
    header.append(label, value, close);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.id = 'level';
    slider.min = 0;
    slider.max = maxLevel;
    slider.step = 5;
    slider.addEventListener('input', (event) => {
      if (event.isTrusted) void setTabLevel(slider.valueAsNumber);
    });

    const footer = document.createElement('div');
    footer.className = 'row';
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.textContent = 'Reset';
    reset.addEventListener('click', (event) => {
      if (event.isTrusted) void setTabLevel(normalLevel);
    });
    const status = document.createElement('span');
    status.setAttribute('role', 'status');
    footer.append(reset, status);

    const container = document.createElement('div');
    container.className = 'panel';
    container.append(header, slider, footer);
    shadow.append(container);
    return { host, slider, value, reset, status };
  }

  function openControls() {
    if (!panel) {
      panel = buildPanel();
      if (!watchedRoots.has(document)) watchRoot(document);
    } else {
      findPlayers(document);
    }
    renderLevel();
    refreshPlayers();
    if (!panel.host.isConnected) document.documentElement.append(panel.host);
    panel.host.showPopover();
    panel.slider.focus();
  }

  function toggleControls() {
    if (panel?.host.matches(':popover-open')) panel.host.hidePopover();
    else openControls();
  }

  function isFocusedFrame(source) {
    const focusedFrame = document.activeElement?.contentWindow;
    if (!focusedFrame || !navigator.userActivation.isActive) return false;

    for (let frame = source; frame && frame !== pageWindow; frame = frame.parent) {
      if (frame === focusedFrame) return true;
      if (frame === frame.parent) break;
    }
    return false;
  }

  window.addEventListener('message', (event) => {
    if (topFrame && event.data === openPanelMessage && isFocusedFrame(event.source)) {
      openControls();
    }
    if (topFrame || event.source !== pageWindow.top || event.data !== refreshLevelMessage || readScheduled) return;

    // The message only wakes the frame. The level comes from Tampermonkey's tab data.
    readScheduled = true;
    window.setTimeout(() => {
      readScheduled = false;
      void readTabLevel();
    }, 50);
  });

  window.addEventListener('pointerup', (event) => {
    if (event.isTrusted) resumeAudio();
  }, true);

  window.addEventListener('pageshow', (event) => {
    if (event.persisted) void readTabLevel();
  });

  window.addEventListener('keydown', (event) => {
    if (!event.isTrusted || event.repeat) return;
    resumeAudio();

    const isOpen = panel?.host.matches(':popover-open');
    const shortcut = event.code === 'KeyV' && event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey;
    if (!shortcut && !(isOpen && event.key === 'Escape')) return;

    event.preventDefault();
    event.stopPropagation();
    if (topFrame) toggleControls();
    else pageWindow.top.postMessage(openPanelMessage, '*');
  }, true);

  if (topFrame) GM_registerMenuCommand('Open volume controls', openControls);
  void readTabLevel();
})();
