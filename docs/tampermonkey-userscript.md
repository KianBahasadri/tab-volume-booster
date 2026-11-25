# Tampermonkey Userscript (Retired Approach)

The project originally shipped as a standalone Tampermonkey userscript (`tab-volume-booster.user.js`, `v1.0.0` through `v1.1.0`, commits `836d4fd`–`5a9087c`) before pivoting to a Firefox WebExtension.

## How It Worked

- Single IIFE running at `@run-at document-idle` in `@sandbox DOM` on `http://*/*` and `https://*/*` with `@downloadURL none`.
- Used `GM_registerMenuCommand` (top frame) plus a capture-phase `Alt+Shift+V` shortcut to open an injected `<div popover="manual">` panel styled inside an open shadow root.
- Synced volume levels (`0%`–`600%`) across top and iframe documents using `GM.getTab` / `GM.saveTab`, a serialized write loop (`pendingLevel` / `savingLevel` / `levelRead`), `postMessage` wakeups with a 50ms debounce, and `isFocusedFrame()` + `navigator.userActivation.isActive` validation for iframe shortcuts.
- Routed eligible `<audio>` and `<video>` elements (including open shadow roots) through a per-frame `AudioContext` and `GainNode`, gating eligibility on `url.protocol === 'data:' || url.origin === location.origin || player.crossOrigin !== null`.

## Restrictions Encountered

Testing against Panopto (`https://queensu.ca.panopto.com/Panopto/Pages/Viewer.aspx?...`) exposed a hard browser boundary that a Tampermonkey userscript cannot cleanly cross:

1. **Cross-origin CDN media without CORS headers:** Panopto served `<video id="primaryVideo">` from `https://s-cloudfront.cdn.ca.panopto.com/...mp4` with `crossOrigin === null`, and the CDN omitted `Access-Control-Allow-Origin` (`MissingAllowOriginHeader` on both `credentials: "omit"` and `"include"` CORS `HEAD` checks).
   - Connecting a non-CORS cross-origin media element to `AudioContext.createMediaElementSource()` outputs silence due to browser same-origin policy.
   - Setting `video.crossOrigin = "anonymous"` from the userscript fails video loading with a CORS error because the CDN sends no `Access-Control-Allow-Origin` header.
2. **No `tabCapture` in Firefox:** Chromium's `chrome.tabCapture` API is not implemented in Firefox (Mozilla Bug 1391223), and Tampermonkey does not expose tab audio capture anyway.
3. **No response-header rewriting in Tampermonkey:** Tampermonkey's `GM_webRequest` only cancels or redirects requests; it cannot inject `Access-Control-Allow-Origin` or `Vary: Origin` response headers.
4. **Why `GM_xmlhttpRequest` was rejected:** Fetching the MP4 via `GM_xmlhttpRequest` into a same-origin `blob:` URL would require downloading entire multi-hundred-MB lectures into RAM, break streaming/seeking and site player wrappers, fail on HLS/DASH without manifest rewriting, and require broad `@connect *` network permissions.
5. **Avoidable userscript UI & sync complexity:** Without a native toolbar popup or background script, the userscript had to maintain an injected Shadow DOM popover (fighting page/extension CSS such as Dark Reader and host-element overrides), custom `GM.getTab` race guards, and `postMessage` frame coordination.

## Outcome

Replaced cleanly with a Firefox Manifest V3 extension using `webRequest.onHeadersReceived` (`webRequestBlocking`) + `crossOrigin` reload and a native toolbar popup.
