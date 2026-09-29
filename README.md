# anime3rb.com — Miru extension repository

A [Miru](https://github.com/miru-project/miru_app) extension repository that
serves extensions over plain HTTPS with no authentication.

## Layout

```
index.json          # extension index consumed by the Miru app
repo/
  anime3rb.com.js   # the extension itself
```

Miru resolves an extension as `<MiruRepoUrl>/repo/<package>.js`, so the file
name **must** match the `package` field in the extension header. The `url`
field in `index.json` is informational only and is ignored by the app.

## Usage

1. Open Miru → Settings → change **Extension repository** to this repo's raw
   root, e.g. `https://raw.githubusercontent.com/9anime-dev/repo/main`
   (the `index.json` lives there, and `repo/anime3rb.com.js` sits next to it).
2. Reload the extension list and install **Anime3rb**.

Installing a single file directly also works:

```
https://raw.githubusercontent.com/9anime-dev/repo/main/repo/anime3rb.com.js
```

## Extensions

| Name | Package | Type | Lang | Version |
| --- | --- | --- | --- | --- |
| Anime3rb | `anime3rb.com` | bangumi | ar | v0.0.1 |

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
