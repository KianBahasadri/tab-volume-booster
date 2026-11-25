# CORS Handling and Audio Routing

Each frame's `content.js` discovers `HTMLMediaElement` nodes locally and routes them through a per-frame `AudioContext` and `GainNode`, while `background.js` enables CORS on cross-origin `media` responses for boosted tabs.

## Cross-Origin Media Header Injection (`background.js`)

`browser.webRequest.onHeadersReceived` listens with `['blocking', 'responseHeaders']` strictly on `{ urls: ['http://*/*', 'https://*/*'], types: ['media'] }`:

- If the event page has not finished hydrating from `storage.session` (`!hydrated`), it returns `ready.then(() => handleHeaders(details))`; once hydrated, `handleHeaders` runs synchronously.
- Ignores non-tab requests (`tabId < 0`), null/unparseable origins, and same-origin requests (`requestOrigin === mediaOrigin`, where `requestOrigin` comes from `details.originUrl || details.documentUrl`).
- **Always on cross-origin `media`:** Calls `ensureVaryOrigin(headers)` so Firefox keys non-CORS and CORS cache entries separately. Without `Vary: Origin`, a video initially cached without CORS headers before boosting would fail from cache when reloaded with `crossOrigin`.
- **Only when the tab is boosted (`levels.has(details.tabId)`):** Sets `Access-Control-Allow-Origin: <requestOrigin>` and `Access-Control-Allow-Credentials: true`. Unboosted tabs never receive modified CORS headers.

## In-Place `crossOrigin` Reload (`content.js`)

`needsCorsReload(player)` returns `true` for a connected, eligible, unrouted cross-origin element (`url.protocol !== 'data:' && url.origin !== location.origin`) whose `crossOrigin === null` and whose current `currentSrc` has not already been attempted (`corsAttempted`, a `WeakMap<HTMLMediaElement, string>`).

- While `level === 100`, `refreshPlayers()` counts `needsCorsReload(player)` elements as compatible without reloading them.
- Once `level !== 100`, `enableCors(player)` records `currentSrc` in `corsAttempted`, snapshots `currentTime`, `playbackRate`, and playing state, sets `player.crossOrigin = 'use-credentials'`, and calls `player.load()`:
  - On `loadedmetadata`: restores `currentTime`, `playbackRate`, and playback (`player.play()`), then calls `refreshPlayers()` so the now-CORS player is routed into Web Audio.
  - On `error`: marks `unavailable.add(player)`, removes the `crossorigin` attribute, reloads at the saved timestamp to restore native playback, and refreshes status.

## Player Discovery and Lazy Activation

- `players` (`Set`), `watchedRoots` (`WeakSet`), `routed` (`WeakSet`), `unavailable` (`WeakSet`), `encrypted` (`WeakSet`), and `corsAttempted` (`WeakMap`) track frame-local state.
- Nothing is observed on idle tabs at `100%` until either `applyLevel` receives a non-`100` level or `query-status` arrives from the popup.
- `watchRoot(root)` attaches capture-phase listeners for `playing`, `loadeddata`, `pause`, `ended`, `emptied`, and `encrypted`, starts `MutationObserver` (`{ childList: true, subtree: true }`), and runs `findPlayers(root)`.
- `findPlayers(root)` traverses `root.querySelectorAll('*')`, records `HTMLMediaElement` instances, and recursively watches open `element.shadowRoot` trees.

## Web Audio Graph and Gain Smoothing

- `canRoute(player)` allows elements with no `mediaKeys`, not in `encrypted`/`unavailable`, empty `sinkId`, and either `srcObject instanceof MediaStream` or a `currentSrc` that is `data:`, same-origin (including same-origin `blob:` MSE URLs), or `crossOrigin !== null`.
- `startAudio()` lazily creates one `AudioContext` and `GainNode` per frame (`gain.gain.value = level / 100`), connects `gain` to `destination`, and listens for `statechange`.
- `resumeAudio()` resumes a suspended `AudioContext` on `startAudio()` and on any trusted capture-phase `pointerup` or non-repeat `keydown` in the frame.
- `applyLevel(value)` ramps gain via `gain.gain.cancelScheduledValues(now)` + `gain.gain.setTargetAtTime(level / 100, now, 0.01)`.
- `route(player)` checks `player.mozAudioCaptured` first (Firefox can otherwise allow a duplicate silent source node), then connects `audioContext.createMediaElementSource(player).connect(gain)` and records `routed.add(player)` or `unavailable.add(player)` on failure.

## Remaining Browser Limitations

- **DRM / EME streams** (`player.mediaKeys` or `encrypted` event) cannot be accessed by Web Audio.
- **Closed shadow roots** (`element.shadowRoot === null`) are invisible to content scripts.
- **Players already routed through Web Audio** are skipped (`mozAudioCaptured` or `createMediaElementSource` error).
- **Pre-install cached media:** If a tab loaded cross-origin media before the extension was active (so `Vary: Origin` was not cached), the initial `enableCors` reload can hit a stale non-CORS cache entry and fall back to native playback; reloading the page fixes it.
- **Irreversible routing:** Once connected to `AudioContext`, an element stays routed until page reload. If a player reuses a routed element for a restricted source, `restrictedAfterRouting` instructs the user to reload.
