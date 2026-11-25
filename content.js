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
  const corsAttempted = new WeakMap();

  let level = normalLevel;
  let audioContext;
  let gain;
  let lastStatusKey = '';

  function canRoute(player) {
    if (player.mediaKeys || encrypted.has(player) || player.sinkId || unavailable.has(player)) {
      return false;
    }

    if (player.srcObject instanceof MediaStream) return true;
    if (!player.currentSrc) return false;

    try {
      const url = new URL(player.currentSrc);
      return url.protocol === 'data:' || url.origin === location.origin || player.crossOrigin !== null;
    } catch {
      return false;
    }
  }

  function needsCorsReload(player) {
    if (
      player.mediaKeys ||
      encrypted.has(player) ||
      player.sinkId ||
      unavailable.has(player) ||
      routed.has(player) ||
      player.crossOrigin !== null ||
      player.srcObject instanceof MediaStream ||
      !player.currentSrc ||
      corsAttempted.get(player) === player.currentSrc
    ) {
      return false;
    }

    try {
      const url = new URL(player.currentSrc);
      return url.protocol !== 'data:' && url.origin !== location.origin;
    } catch {
      return false;
    }
  }

  function enableCors(player) {
    corsAttempted.set(player, player.currentSrc);
    const savedTime = player.currentTime;
    const savedRate = player.playbackRate;
    const wasPlaying = !player.paused && !player.ended;

    function cleanup() {
      player.removeEventListener('loadedmetadata', onLoaded);
      player.removeEventListener('error', onError);
    }

    function restorePlayback() {
      if (Number.isFinite(savedTime) && savedTime > 0) {
        try {
          player.currentTime = savedTime;
        } catch {
          // Ignore seek errors on live or unseekable streams.
        }
      }
      player.playbackRate = savedRate;
      if (wasPlaying) player.play().catch(() => {});
    }

    function onLoaded() {
      cleanup();
      restorePlayback();
      refreshPlayers();
    }

    function onError() {
      cleanup();
      unavailable.add(player);
      player.removeAttribute('crossorigin');
      player.addEventListener('loadedmetadata', restorePlayback, { once: true });
      player.load();
      refreshPlayers();
    }

    player.addEventListener('loadedmetadata', onLoaded);
    player.addEventListener('error', onError);
    player.crossOrigin = 'use-credentials';
    player.load();
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

  function startAudio() {
    audioContext = new AudioContext();
    gain = audioContext.createGain();
    gain.gain.value = level / normalLevel;
    gain.connect(audioContext.destination);
    audioContext.addEventListener('statechange', () => refreshPlayers());
    resumeAudio();
  }

  function resumeAudio() {
    if (level !== normalLevel && audioContext?.state === 'suspended') {
      audioContext.resume().catch(() => refreshPlayers());
    }
  }

  function refreshPlayers(forceReport = false) {
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
      if (needsCorsReload(player)) {
        if (level !== normalLevel) enableCors(player);
        compatible += 1;
        continue;
      }
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

    const suspended = compatible > 0 && level !== normalLevel && audioContext?.state !== 'running';
    const statusKey = `${playing}:${compatible}:${restrictedAfterRouting}:${suspended}`;
    if (!forceReport && statusKey === lastStatusKey) return;
    lastStatusKey = statusKey;

    if (forceReport || watchedRoots.has(document)) {
      browser.runtime
        .sendMessage({
          type: 'frame-status',
          playing,
          compatible,
          restrictedAfterRouting,
          suspended,
        })
        .catch(() => {});
    }
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
      if (shadow && !watchedRoots.has(shadow)) watchRoot(shadow);
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

  function applyLevel(value) {
    if (!Number.isInteger(value) || value < 0 || value > maxLevel) return;
    if (level === value) return;

    level = value;
    if (level !== normalLevel && !watchedRoots.has(document)) watchRoot(document);

    if (gain) {
      const now = audioContext.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(level / normalLevel, now, 0.01);
    }
    refreshPlayers(true);
  }

  browser.runtime.onMessage.addListener((message) => {
    if (!message || typeof message !== 'object') return;

    if (message.type === 'set-level') {
      applyLevel(message.level);
      return;
    }

    if (message.type === 'query-status') {
      if (!watchedRoots.has(document)) watchRoot(document);
      else findPlayers(document);
      refreshPlayers(true);
      return Promise.resolve({ ok: true });
    }
  });

  window.addEventListener('pointerup', (event) => {
    if (event.isTrusted) resumeAudio();
  }, true);

  window.addEventListener('keydown', (event) => {
    if (event.isTrusted && !event.repeat) resumeAudio();
  }, true);

  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      browser.runtime
        .sendMessage({ type: 'get-level' })
        .then((response) => {
          if (response) applyLevel(response.level);
        })
        .catch(() => {});
    }
  });

  browser.runtime
    .sendMessage({ type: 'get-level' })
    .then((response) => {
      if (response) applyLevel(response.level);
    })
    .catch(() => {});
})();
