# Tab Volume Booster

A Tampermonkey userscript for adjusting the audio of compatible web players from 0% to 600%. The setting starts at 100% for each page.

## Install

1. Set up Tampermonkey in Firefox or a Chromium-based browser.
2. [Review the script](tab-volume-booster.user.js), then [open the raw userscript](https://raw.githubusercontent.com/KianBahasadri/tab-volume-booster/main/tab-volume-booster.user.js) and confirm the install in Tampermonkey.
3. Reload the page with audio. Choose **Open volume controls** from the Tampermonkey menu or press **Alt+Shift+V**. For an embedded player, click inside the player frame first and use the shortcut there.
4. Adjust the slider. **Reset** returns the gain to 100%. Close the panel with **Escape** or the close button.

## Compatibility

The script uses Web Audio for HTML audio and video elements in the current document, including players in open shadow roots. Same-origin sources and cross-origin sources loaded with CORS are supported. Browser restrictions limit access to protected streams, media loaded without CORS from other origins, and players that already process audio through Web Audio. A userscript processes these elements individually and a browser extension API is required to capture the full tab mix.

Boosting routes the player through Web Audio until you reload. If a player reuses the same element for a restricted source, reload to restore native audio routing. Where a site provides its own volume and mute controls, those still affect the input level.

## Privacy and updates

The script processes audio locally and makes zero network requests. It has no dependencies and uses a single Tampermonkey grant for its menu command. Updates are manual so you can review the source before installing each version.
