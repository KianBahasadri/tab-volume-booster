// ==UserScript==
// @name         Tab Volume Booster
// @namespace    https://github.com/KianBahasadri/tab-volume-booster
// @version      1.0.0
// @description  Adjust the volume of compatible web audio and video players from 0% to 600%.
// @match        https://*/*
// @match        http://*/*
// @run-at       document-idle
// @sandbox      DOM
// @grant        GM_registerMenuCommand
// @downloadURL  none
// ==/UserScript==

(() => {
  'use strict';

  const normalLevel = 100;
  const maxLevel = 600;
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
      if (level !== normalLevel && audioContext?.state === 'running' && !routed.has(player)) {
        route(player);
      }
      if (!unavailable.has(player)) compatible += 1;
    }

    let message = '';
    if (restrictedAfterRouting) {
      message = 'The player switched to restricted audio. Reload the page to restore native playback.';
    } else if (!playing) {
      message = 'Start audio or video to hear the adjustment.';
    } else if (!compatible) {
      message = 'Audio from this player is unavailable to the script.';
    } else if (level !== normalLevel && audioContext?.state !== 'running') {
      message = 'Click the slider to enable audio processing.';
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
      if (shadow && element !== panel.host && !watchedRoots.has(shadow)) watchRoot(shadow);
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

  function resumeAudio() {
    if (!audioContext) {
      audioContext = new AudioContext();
      gain = audioContext.createGain();
      gain.connect(audioContext.destination);
      audioContext.addEventListener('statechange', refreshPlayers);
    }
    if (audioContext.state === 'suspended') audioContext.resume().catch(refreshPlayers);
  }

  function setLevel(value) {
    level = Math.max(0, Math.min(maxLevel, value));
    panel.slider.value = level;
    panel.slider.setAttribute('aria-valuetext', `${level}%`);
    panel.value.value = `${level}%`;
    panel.reset.disabled = level === normalLevel;

    if (level !== normalLevel) resumeAudio();
    if (gain) {
      const now = audioContext.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(level / normalLevel, now, 0.01);
    }
    refreshPlayers();
  }

  function buildPanel() {
    const host = document.createElement('div');
    host.setAttribute('popover', 'manual');
    host.setAttribute('data-tab-volume-booster', '');
    const shadow = host.attachShadow({ mode: 'open' });
    const styles = new CSSStyleSheet();
    styles.replaceSync(`
      :host {
        all: initial;
        position: fixed;
        inset: auto 12px 12px auto;
        margin: 0;
        box-sizing: border-box;
        width: min(288px, calc(100vw - 24px));
        padding: 12px;
        border: 1px solid #50555f;
        border-radius: 10px;
        background: #17191e;
        color: #fafafa;
        color-scheme: dark;
        box-shadow: 0 4px 16px #0006;
        font: 14px/1.4 system-ui, sans-serif;
      }
      :host(:not(:popover-open)) { display: none; }
      .row { display: flex; align-items: center; gap: 8px; }
      label { flex: 1; font-weight: 600; }
      output { font-variant-numeric: tabular-nums; }
      input { width: 100%; margin: 12px 0; accent-color: #a8c7ff; }
      button {
        border: 1px solid #50555f;
        border-radius: 5px;
        background: #22252c;
        color: inherit;
        padding: 3px 8px;
        font: inherit;
      }
      button:enabled { cursor: pointer; }
      button:enabled:hover { background: #363c48; }
      button:disabled { opacity: 0.55; }
      :focus-visible { outline: 2px solid #a8c7ff; outline-offset: 2px; }
      [role=status] { color: #d2d5de; font-size: 12px; }
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
      if (event.isTrusted) setLevel(slider.valueAsNumber);
    });
    slider.addEventListener('pointerup', (event) => {
      if (event.isTrusted && level !== normalLevel) resumeAudio();
    });

    const footer = document.createElement('div');
    footer.className = 'row';
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.textContent = 'Reset';
    reset.addEventListener('click', (event) => {
      if (event.isTrusted) setLevel(normalLevel);
    });
    const status = document.createElement('span');
    status.setAttribute('role', 'status');
    footer.append(reset, status);

    shadow.append(header, slider, footer);
    return { host, slider, value, reset, status };
  }

  function openControls() {
    if (!panel) {
      panel = buildPanel();
      watchRoot(document);
      setLevel(level);
    } else {
      findPlayers(document);
      refreshPlayers();
    }
    if (!panel.host.isConnected) document.documentElement.append(panel.host);
    panel.host.showPopover();
    panel.slider.focus();
  }

  window.addEventListener('keydown', (event) => {
    if (!event.isTrusted || event.repeat) return;

    const isOpen = panel?.host.matches(':popover-open');
    const shortcut = event.code === 'KeyV' && event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey;
    if (!shortcut && !(isOpen && event.key === 'Escape')) return;

    event.preventDefault();
    event.stopPropagation();
    if (isOpen) panel.host.hidePopover();
    else openControls();
  }, true);

  if (window === window.top) GM_registerMenuCommand('Open volume controls', openControls);
})();
