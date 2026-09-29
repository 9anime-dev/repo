# Arabic anime Miru extension repository

A [Miru](https://github.com/miru-project/miru_app) extension repository that
serves extensions over plain HTTPS with no authentication.

## Layout

```
index.json            # extension index consumed by the Miru app
repo/
  anime3rb.com.js     # Anime3rb
  animewitcher.com.js # AnimeWitcher
```

Miru resolves an extension as `<MiruRepoUrl>/repo/<package>.js`, so the file
name **must** match the `package` field in the extension header. The `url`
field in `index.json` is informational only and is ignored by the app.

## Usage

1. Open Miru → Settings → change **Extension repository** to this repo's raw
   root, e.g. `https://raw.githubusercontent.com/9anime-dev/repo/main`
   (the `index.json` lives there, and the `repo/*.js` files sit next to it).
2. Reload the extension list and install the extension you want.

Installing a single file directly also works:

```
https://raw.githubusercontent.com/9anime-dev/repo/main/repo/anime3rb.com.js
https://raw.githubusercontent.com/9anime-dev/repo/main/repo/animewitcher.com.js
```

## Extensions

| Name | Package | Type | Lang | Version | Site |
| --- | --- | --- | --- | --- | --- |
| Anime3rb | `anime3rb.com` | bangumi | ar | v0.0.1 | [anime3rb.com](https://anime3rb.com) |
| AnimeWitcher | `animewitcher.com` | bangumi | ar | v0.0.1 | [animewitcher.com](https://animewitcher.com) |

Both extensions implement `latest`, `search`, `detail` and `watch`, and both
resolve their data without scraping an HTML page for the episode list.

AnimeWitcher talks to the site's own Firestore + Algolia backend and reads the
Algolia credentials from `Settings/constants` at run time, so a key rotation on
the site does not break it. Playback prefers Pixeldrain, then MediaFire, then
StreamFlare, and only hands the player a url that is structurally a direct media
stream.

## Adding an extension

1. Put the file in `repo/` and name it `<package>.js`.
2. Keep the header in sync with `index.json` — `package` and `version` in
   particular, since the app uses the version to detect upgrades.

```js
// ==MiruExtension==
// @name         Anime3rb
// @version      v0.0.1
// @author       9anime
// @lang         ar
// @license      MIT
// @package      anime3rb.com
// @type         bangumi
// @icon         https://anime3rb.com/favicon.ico
// @webSite      https://anime3rb.com
// ==/MiruExtension==
```

Do **not** implement `createFilter`. The search page treats a `null` filter
result as "this extension has no filters" and then calls `latest()` for an
empty query; returning an empty object instead would force `search("")`.

## License

MIT — see [LICENSE](LICENSE). Extensions belong to their respective authors
and are not covered by the site operator.
