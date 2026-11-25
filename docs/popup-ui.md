# Popup UI

Controls are rendered in Firefox's native toolbar `action` popup (`popup.html` + `popup.js`), avoiding page-injected DOM overlays and CSS conflicts.

## Opening and Shortcut

- Clicking the toolbar icon or pressing **Alt+Shift+V** (`commands._execute_action` in `manifest.json`) opens `popup.html`.
- Pressing **Escape** closes the popup natively.
- On open, `popup.js` queries the active tab, fetches its current level via `{ type: 'get-level', tabId }`, sends `{ type: 'query-status' }` to all frames in that tab, and focuses the range slider.

## Styling and Controls

- `popup.html` sets `color-scheme: light dark` and uses CSS `light-dark()` tokens for background, text, border, accent, button, and status colors so the UI follows the browser's theme automatically.
- Controls:
  - Range slider (`#level`, `0`–`600`, step `5`, syncing `aria-valuetext`) paired with `<output id="value">` (`tabular-nums`).
  - **Reset** button (`#reset`), disabled at `100%` or on unavailable pages, returning the tab to `100%`.
  - Live status region (`<span id="status" role="status">`).
- Both slider `input` and Reset `click` update the popup immediately and send `{ type: 'set-level', tabId, level }` to `background.js`.

## Multi-Frame Status Aggregation

`popup.js` listens for `{ type: 'frame-status' }` messages matching `activeTabId`, stores each frame's latest report in `frameStatuses` keyed by `sender.frameId`, and computes a single status string in priority order:

| Priority | Condition | Message |
| --- | --- | --- |
| 1 | `query-status` rejected (restricted page such as `about:*` or `addons.mozilla.org`) | `Unavailable on this page.` (also disables slider and Reset) |
| 2 | Any frame has `restrictedAfterRouting` | `A player switched to restricted audio. Reload the page to restore native playback.` |
| 3 | Sum of `playing` across all frames is `0` | `Start audio or video to hear the adjustment.` |
| 4 | Sum of `compatible` across all frames is `0` | `Audio from this player is unavailable to the extension.` |
| 5 | `currentLevel !== 100` and any frame has `suspended` | `Click the player to enable audio processing.` |
| 6 | Otherwise | `""` (empty) |
