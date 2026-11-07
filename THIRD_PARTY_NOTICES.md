# Third-party notices

This plugin's original source is licensed under AGPL-3.0-only; see `LICENSE`.

## Bundled runtime dependency

- `@noble/ciphers` 2.4.0 — https://github.com/paulmillr/noble-ciphers
- License: MIT. The full notice is in `licenses/noble-ciphers.txt`.
- Only the code needed for AES-ECB URL decoding is bundled into `index.js`.

## Protocol and host references

- MyGo Music: https://github.com/egoist/mygo-music
  - `README.md`, `examples/demo-plugin`, `internal/plugin`, `internal/music/music.go`.
- NetEase reference plugin: https://github.com/sogud/mygo-music-netease
  - Its session invalidation, request coalescing and packaging approach informed
    this implementation. NetEase-specific API, cryptography and account data are
    not included. This is an independent implementation of the Ximalaya adapter.
- Ximalaya's publicly served web client:
  - https://www.ximalaya.com/
  - https://www.ximalaya.com/page/web/login
  - Web app bundle `yx/ximalaya-web-static/last/dist/scripts/f714bf.js`
  - Player bundle `yx/ximalaya-web-static/last/dist/scripts/75b01af22.js`
  - Checked on 2026-11-07 for account/profile, search, album, subscription,
    playback parameters and the public AES-ECB playback-URL protocol key.
  - The key describes the web-player URL encoding; it is not a user's secret.
  - No Ximalaya script bundles or audio recordings are distributed with this plugin.

Build and test tooling is development-only and is not included in the plugin ZIP.

Ximalaya and MyGo Music names and content belong to their respective owners.
This is an unofficial plugin. Playback uses the service's returned permissions;
the plugin does not grant access to content a listener is not entitled to play.
