# Extension Architecture

The Firefox extension lives directly at the repository root so `manifest.json` can be loaded without a build step or external dependencies.

## Files

| File | Role |
| --- | --- |
| `manifest.json` | Firefox Manifest V3 definition (`strict_min_version: "142.0"`, `data_collection_permissions.required: ["none"]`, self-hosted `update_url` pointing at GitHub Releases `updates.json`). |
| `background.js` | MV3 event page storing per-tab volume levels, updating the toolbar badge, routing messages, and injecting CORS headers on cross-origin media. |
| `content.js` | Content script injected into all HTTP(S) frames (`all_frames: true`, `run_at: "document_idle"`) to discover players and route Web Audio. |
| `popup.html` / `popup.js` | Native `action` popup UI and multi-frame status aggregator. |
| `icon.svg` | Toolbar and add-on icon. |
| `sign.sh` | Local self-signing helper that opens an existing `web-ext-artifacts/*-<version>.xpi` in Firefox if the current `manifest.json` version is already signed; otherwise loads/prompts AMO credentials into gitignored `.env`, stages the 6 extension files in a temp directory, runs `npx web-ext sign --channel=unlisted`, and opens the signed `.xpi` in Firefox. |
| `.github/workflows/release.yml` | GitHub Actions workflow triggered when `manifest.json` changes on `main` (or `workflow_dispatch`). Skips if release `v<version>` already exists; otherwise lints, signs via AMO (`--channel=unlisted` using `WEB_EXT_API_KEY` / `WEB_EXT_API_SECRET` repo secrets), generates `updates.json` with SHA-256 `update_hash`, and publishes `tab-volume-booster-<version>.xpi` + `updates.json` to a GitHub Release so Firefox auto-updates via `update_url`. |

## Permissions

- `permissions`: `storage` (for `browser.storage.session`), `webRequest`, and `webRequestBlocking` (supported by Firefox in MV3 for `onHeadersReceived` header modification).
- `host_permissions`: `http://*/*`, `https://*/*` (granted at install time in Firefox ≥ 127; needed for `content_scripts` and `webRequest` interception).
- The `tabs` permission is intentionally omitted: `tabs.query({ active: true, currentWindow: true })`, `tabs.sendMessage()`, and `tabs.onRemoved` do not require it because the extension never reads tab URLs or titles.

## Per-Tab State and Event Page Persistence

`background.js` keeps non-default tab levels (`level !== 100`, integer `0`–`600`) in an in-memory `Map<tabId, number>` mirrored to `browser.storage.session` under `tabLevels`:

- On event-page startup, `ready` hydrates `levels` once from `browser.storage.session` and flips `hydrated = true`.
- `tabs.onRemoved` deletes the closed tab's entry from `levels` and persists the updated map.
- `updateBadge(tabId, value)` displays `${value}%` on a `#2456a3` badge when boosted and clears the badge at `100%`. When the top frame (`sender.frameId === 0`) requests `get-level` after navigation, the badge is re-applied if the tab is boosted.

## Message Flow

| Message | Sender → Receiver | Behavior |
| --- | --- | --- |
| `{ type: 'get-level', tabId? }` | `popup.js` or `content.js` → `background.js` | Returns `{ level }` for `message.tabId` or `sender.tab.id` (defaults to `100`). |
| `{ type: 'set-level', tabId, level }` | `popup.js` → `background.js` | Updates `levels` synchronously, persists to `storage.session`, updates the badge, and broadcasts `{ type: 'set-level', level }` to all frames in `tabId` via `tabs.sendMessage`. |
| `{ type: 'query-status' }` | `popup.js` → all frames via `tabs.sendMessage` | Starts observation if needed, rescans players, forces a `frame-status` report, and replies `{ ok: true }`. |
| `{ type: 'frame-status', playing, compatible, restrictedAfterRouting, suspended }` | `content.js` → `popup.js` via `runtime.sendMessage` | Delivers per-frame player counts and flags so the popup can aggregate status across all frames. |

On `pageshow` with `event.persisted === true` (bfcache restore), `content.js` re-queries `get-level` from `background.js`.
