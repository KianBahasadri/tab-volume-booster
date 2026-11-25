# Tab Volume Booster

A Tampermonkey userscript for adjusting the audio of compatible web players from 0% to 600%. Each tab starts at 100% and keeps its setting until you reset it or close the tab. The panel follows your browser's light or dark preference.

## Install

1. Set up Tampermonkey in Firefox or a Chromium-based browser.
2. [Review the script](tab-volume-booster.user.js), then [open the raw userscript](https://raw.githubusercontent.com/KianBahasadri/tab-volume-booster/main/tab-volume-booster.user.js) and confirm the install in Tampermonkey.
3. Reload the page with audio. Choose **Open volume controls** from the Tampermonkey menu or press **Alt+Shift+V**. The slider also reaches compatible players inside iframes where Tampermonkey runs.
4. Adjust the slider. **Reset** returns the gain to 100%. Close the panel with **Escape** or the close button.

## Compatibility

The script uses Web Audio for HTML audio and video elements, including players in open shadow roots. Media from the player's own origin and cross-origin media loaded with CORS are supported. Browser restrictions limit access to protected streams, media loaded without CORS from other origins, and players that already process audio through Web Audio. If a compatible embed requires a playback gesture, click inside the player once. A browser extension API is required to capture the full tab mix.

Boosting routes the player through Web Audio until you reload. If a player reuses the same element for a restricted source, reload to restore native audio routing. Where a site provides its own volume and mute controls, those still affect the input level.

## Privacy and updates

The script processes audio locally, has no dependencies, and makes zero network requests. Tampermonkey shares the volume setting between frames for the lifetime of the tab. Updates are manual so you can review the source before installing each version.
