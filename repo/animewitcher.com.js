// ==MiruExtension==
// @name         AnimeWitcher
// @version      v0.0.1
// @author       9anime
// @lang         ar
// @license      MIT
// @package      animewitcher.com
// @type         bangumi
// @icon         https://static.wixstatic.com/media/3be632_4b58453c6bf04b7eb8392ab592ad5d82%7Emv2.png/v1/fill/w_192%2Ch_192%2Clg_1%2Cusm_0.66_1.00_0.01/3be632_4b58453c6bf04b7eb8392ab592ad5d82%7Emv2.png
// @webSite      https://animewitcher.com
// ==/MiruExtension==

export default class extends Extension {
  base = "https://animewitcher.com";
  fsProject = "animewitcher-1c66d";
  fsKey = "AIzaSyAcbWRwfFNnCpoydDXlEALWnM_TYVcJOMU";
  ua =
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";

  algApp = "";
  algKey = "";
  wordCache = {};

  seriesUrl(id) {
    return `${this.base}/miru/series/${encodeURIComponent(id)}`;
  }

  episodeUrl(id, ep) {
    return `${this.base}/miru/episode/${encodeURIComponent(id)}/${encodeURIComponent(ep)}`;
  }

  clean(text) {
    return String(text || "")
      .replace(/<\/?em>/g, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\\n/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  async req(url, options = {}) {
    return this.request("", {
      ...options,
      headers: {
        "User-Agent": this.ua,
        ...(options.headers || {}),
        "Miru-Url": url,
      },
    });
  }

  async get(url, tries = 3) {
    let error;
    for (let i = 0; i < tries; i++) {
      try {
        const res = await this.req(url);
        if (res) return res;
      } catch (e) {
        error = e;
      }
    }
    throw error || new Error(`animewitcher: request failed ${url}`);
  }

  fsUrl(path) {
    return `https://firestore.googleapis.com/v1/projects/${this.fsProject}/databases/(default)/documents/${path}?key=${this.fsKey}`;
  }

  // The Algolia app id / api key rotate; the site keeps the current pair in
  // Firestore, so always read them from there instead of hardcoding.
  async keys(force = false) {
    if (!force && this.algApp && this.algKey) return;
    const doc = await this.get(this.fsUrl("Settings/constants"));
    const f = doc?.fields?.search_settings?.mapValue?.fields || {};
    this.algApp =
      f.app_id_v3?.stringValue || f.app_id?.stringValue || f.app_id_v2?.stringValue || "";
    this.algKey = f.api_key?.stringValue || "";
    if (!this.algApp || !this.algKey) throw new Error("animewitcher: algolia keys unavailable");
  }

  async algolia(index, params) {
    await this.keys();
    const send = () =>
      this.req(`https://${this.algApp}-dsn.algolia.net/1/indexes/${index}/query`, {
        method: "POST",
        headers: {
          "X-Algolia-Application-Id": this.algApp,
          "X-Algolia-API-Key": this.algKey,
        },
        data: { params },
      });
    try {
      return await send();
    } catch (e) {
      await this.keys(true);
      return await send();
    }
  }

  posterOf(hit) {
    return hit?.poster?.medium || hit?.poster_uri || hit?.cover_uri || "";
  }

  async latest(page) {
    const index = Math.max(0, (page || 1) - 1);
    const attrs = encodeURIComponent(
      JSON.stringify([
        "name",
        "date",
        "doc_ref",
        "episode_id",
        "anime_id",
        "episode_name",
        "poster_uri",
        "thumb_uri",
        "type",
        "objectID",
      ])
    );
    const res = await this.algolia(
      "recent",
      `attributesToRetrieve=${attrs}&hitsPerPage=30&page=${index}&query=`
    );
    const items = [];
    for (const hit of res?.hits || []) {
      const id = hit.anime_id || hit.objectID || "";
      if (!id) continue;
      items.push({
        title: hit.name || id,
        url: this.seriesUrl(id),
        cover: hit.poster_uri || hit.thumb_uri || "",
        update: hit.episode_name || "",
      });
    }
    return items;
  }

  async search(kw, page) {
    const index = Math.max(0, (page || 1) - 1);
    const attrs = encodeURIComponent(
      JSON.stringify(["objectID", "name", "poster_uri", "cover_uri", "poster", "path", "type"])
    );
    const res = await this.algolia(
      "series",
      `attributesToRetrieve=${attrs}&hitsPerPage=50&page=${index}&query=${encodeURIComponent(kw)}`
    );
    const items = [];
    for (const hit of res?.hits || []) {
      const id = hit.objectID || "";
      if (!id || !hit.name) continue;
      items.push({ title: hit.name, url: this.seriesUrl(id), cover: this.posterOf(hit) });
    }
    return items;
  }

  async detail(url) {
    const found = String(url).split("?")[0].match(/\/miru\/series\/([^/]+)\/?$/);
    const id = found ? decodeURIComponent(found[1]) : "";
    if (!id) throw new Error("animewitcher: bad series url");
    const res = await this.algolia("series", `filters=objectID:${JSON.stringify(id)}&hitsPerPage=1`);
    const hit = res?.hits?.[0] || {};
    const details = hit.details || {};
    const facts = [details.season, details.eps_num, details.state].filter(Boolean).join(" - ");
    const story = this.clean(hit.story || "");
    return {
      title: hit.name || id,
      cover: this.posterOf(hit),
      desc: [story, facts].filter(Boolean).join("\n\n"),
      episodes: [{ title: "الحلقات", urls: await this.episodes(id) }],
    };
  }

  async episodes(id) {
    let doc;
    try {
      doc = await this.get(this.fsUrl(`anime_list/${encodeURIComponent(id)}/episodes_summery/summery`), 2);
    } catch (e) {
      return [];
    }
    const values = doc?.fields?.episodes?.arrayValue?.values || [];
    const list = [];
    values.forEach((value, index) => {
      const f = value?.mapValue?.fields || {};
      const docId = f.doc_id?.stringValue;
      if (!docId) return;
      const translated = f.title_translated?.mapValue?.fields || {};
      const number = f.number?.integerValue ?? f.number?.stringValue;
      const n = parseInt(String(number ?? docId), 10) || index + 1;
      list.push({
        name: translated.ar || f.name?.stringValue || `الحلقة ${n}`,
        url: this.episodeUrl(id, docId),
      });
    });
    return list.reverse();
  }

  async servers(id, ep) {
    const base = `anime_list/${encodeURIComponent(id)}/episodes/${encodeURIComponent(ep)}`;
    let values = [];
    try {
      const doc = await this.get(this.fsUrl(`${base}/servers2/all_servers`), 2);
      values = doc?.fields?.servers?.arrayValue?.values || [];
    } catch (e) {
      values = [];
    }
    if (values.length) return values.map((value) => this.serverOf(value));
    try {
      const list = await this.get(this.fsUrl(`${base}/servers`), 1);
      const out = [];
      for (const document of list?.documents || []) {
        const f = document?.fields || {};
        if (f.visible?.booleanValue === false) continue;
        out.push(this.serverOf({ mapValue: { fields: f } }));
      }
      return out.filter((server) => server.name && server.link);
    } catch (e) {
      return [];
    }
  }

  serverOf(value) {
    const f = value?.mapValue?.fields || {};
    return {
      name: f.name?.stringValue || "",
      quality: f.quality?.stringValue || "",
      link: f.link?.stringValue || "",
      original: f.original_link?.stringValue || "",
    };
  }

  qualityOf(server) {
    return parseInt(String(server.quality || "").replace(/\D/g, ""), 10) || 0;
  }

  // Types whose link is directly playable rank above scraped ones, so a
  // 1080p mediafire page never shadows a working 1080p pixeldrain stream.
  rankOf(server) {
    const order = ["PD", "MF2", "SF", "KF", "ST", "MF"];
    const index = order.indexOf(String(server.name || "").toUpperCase());
    return index === -1 ? order.length : index;
  }

  playbackType(url) {
    return /\.m3u8(\?|$)/i.test(String(url)) ? "hls" : "mp4";
  }

  // Structural check on the resolved url. The extension bridge only exposes the
  // response body and never the content-type, so a probe cannot tell an html
  // page from a video; the cdn shapes that are known to serve bytes are matched
  // instead. Mediafire landing pages, streamtape get_video blobs and anything
  // else fall through to false and get refused, because they resolve fine but
  // never play.
  isDirectMedia(url) {
    const value = String(url);
    if (/\.(m3u8|mp4|mkv|webm|avi|mov|flv|ts)(\?|$)/i.test(value)) return true;
    if (/^https?:\/\/pixeldrain\.com\/api\/file\//i.test(value)) return true;
    if (/^https?:\/\/download\d*\.mediafire\.com\//i.test(value)) return true;
    if (/^https?:\/\/[^/]*\.firestream\.to\//i.test(value)) return true;
    return false;
  }

  // Last resort when a cdn moved and no known shape matched: fetch a single
  // small ranged slice and reject anything that is markup or a json error.
  async probe(url, headers) {
    try {
      const body = await this.req(url, {
        headers: { ...(headers || {}), Range: "bytes=0-1023" },
      });
      if (body === null || body === undefined) return null;
      if (typeof body === "object") return null;
      const text = String(body);
      const head = text.slice(0, 300).toLowerCase();
      if (head.includes("<!doctype") || head.includes("<html") || head.includes("<head")) return null;
      if (text.length < 512) return null;
      return this.playbackType(url);
    } catch (e) {
      return null;
    }
  }

  async wordsFor(name) {
    if (this.wordCache[name]) return this.wordCache[name];
    const doc = await this.get(this.fsUrl(`Settings/servers/servers/${encodeURIComponent(name)}`));
    const f = doc?.fields || {};
    const words = {
      word1: f.word1?.stringValue,
      word2: f.word2?.stringValue,
      word3: f.word3?.stringValue,
      word4: f.word4?.stringValue,
    };
    this.wordCache[name] = words;
    return words;
  }

  normalizeUrl(value) {
    if (!value) return null;
    let url = String(value)
      .replace(/&amp;/g, "&")
      .replace(/\\?["'>]+/g, "")
      .replace(/\\+$/, "")
      .trim();
    if (url.startsWith("//")) return `https:${url}`;
    if (/^https?:\/\//i.test(url)) return url;
    if (/^[\w\-]+(\.[\w\-]+)+\//.test(url)) return `https://${url}`;
    return null;
  }

  async resolve(server) {
    const name = String(server.name || "").toUpperCase();
    const link = String(server.link || "");

    // Pixeldrain exposes the file directly under /api/file/<id>
    if (name === "PD" && /\/u\/[A-Za-z0-9]+/.test(link)) {
      const id = link.match(/\/u\/([A-Za-z0-9]+)/)[1];
      return `https://pixeldrain.com/api/file/${id}`;
    }

    // Streamtape never hands the media url to the site's own scraper (its
    // get_video endpoint answers 403), so scraping it only burns a request and
    // yields a junk host.
    if (name === "ST") return null;

    if (link) {
      try {
        const words = await this.wordsFor(name);
        if (words.word1 && words.word2) {
          const page = await this.get(link);
          const chunk = page.split(words.word1);
          if (chunk.length > 1) {
            const url = this.normalizeUrl(chunk[1].split(words.word2)[0]);
            if (url) return url;
          }
        }
      } catch (e) {}
    }

    if (/^https?:\/\//i.test(String(server.original || ""))) return server.original;
    return null;
  }

  async watch(url) {
    const found = String(url).split("?")[0].match(/\/miru\/episode\/([^/]+)\/([^/]+)\/?$/);
    const id = found ? decodeURIComponent(found[1]) : "";
    const ep = found ? decodeURIComponent(found[2]) : "";
    if (!id || !ep) throw new Error("animewitcher: bad episode url");

    const servers = await this.servers(id, ep);
    if (!servers.length) throw new Error("animewitcher: no servers for this episode");
    const ordered = servers
      .slice()
      .sort(
        (a, b) => this.rankOf(a) - this.rankOf(b) || this.qualityOf(b) - this.qualityOf(a)
      );

    let fallback = null;
    for (const server of ordered) {
      const resolved = await this.resolve(server);
      if (!resolved) continue;
      const headers = { "User-Agent": this.ua, Referer: this.originOf(resolved) };
      if (this.isDirectMedia(resolved)) {
        return { type: this.playbackType(resolved), url: resolved, headers };
      }
      if (!fallback) fallback = { resolved, headers };
    }

    if (fallback) {
      const type = await this.probe(fallback.resolved, fallback.headers);
      if (type) return { type, url: fallback.resolved, headers: fallback.headers };
    }
    throw new Error("animewitcher: no playable source found");
  }

  originOf(url) {
    const match = String(url).match(/^(https?:\/\/[^/]+)/i);
    return match ? `${match[1]}/` : this.base;
  }
}
