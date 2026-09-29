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

export default class extends Extension {
  base = "https://anime3rb.com";
  player = "https://video.vid3rb.com";
  ua =
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";

  toAbsolute(url) {
    if (!url) return "";
    const value = String(url).trim();
    if (value.startsWith("http")) return value;
    if (value.startsWith("//")) return `https:${value}`;
    if (value.startsWith("/")) return `${this.base}${value}`;
    return `${this.base}/${value}`;
  }

  clean(text) {
    return String(text || "")
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
    throw error || new Error(`anime3rb: request failed ${url}`);
  }

  async latest(page) {
    const home = await this.get(this.base);
    const sections = [
      "#videos a.video-card",
      ".glide__slide:not(.glide__slide--clone) a.video-card",
    ];
    const items = [];
    const seen = new Set();
    for (const selector of sections) {
      const cards = await this.querySelectorAll(home, selector);
      for (const card of cards) {
        const html = card.content;
        const href = await this.getAttributeText(html, "a", "href");
        if (!href) continue;
        const url = this.toAbsolute(href);
        if (seen.has(url)) continue;
        seen.add(url);
        const title = this.clean(await this.querySelector(html, "h3.title-name").text);
        if (!title) continue;
        const update = this.clean(await this.querySelector(html, "p.number").text);
        const cover = await this.getAttributeText(html, "img", "src");
        items.push({ title, url, cover, update });
      }
    }
    return items;
  }

  async search(kw, page) {
    if (page && page > 1) return [];
    const context = await this.searchContext();
    const res = await this.req(`${this.base}/livewire/update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: this.base,
        Referer: `${this.base}/`,
      },
      data: {
        _token: context.token,
        components: [
          {
            snapshot: JSON.stringify(context.snapshot),
            updates: { query: kw },
            calls: [],
          },
        ],
      },
    });
    const html = res?.components?.[0]?.effects?.html || "";
    if (!html) return [];
    const cards = await this.querySelectorAll(html, "a.simple-title-card");
    const items = [];
    for (const card of cards) {
      const inner = card.content;
      const href = await this.getAttributeText(inner, "a", "href");
      const title = this.clean(await this.querySelector(inner, "h4").text);
      if (!href || !title) continue;
      const cover = await this.getAttributeText(inner, "img", "src");
      items.push({ title, url: this.toAbsolute(href), cover });
    }
    return items;
  }

  async searchContext() {
    const home = await this.get(this.base);
    const token = await this.getAttributeText(home, 'meta[name="csrf-token"]', "content");
    const forms = await this.querySelectorAll(home, "form");
    for (const form of forms) {
      const raw = await this.getAttributeText(form.content, "form", "wire:snapshot");
      if (!raw) continue;
      try {
        const snapshot = JSON.parse(raw);
        if (snapshot?.memo?.name === "search") return { token, snapshot };
      } catch (e) {}
    }
    throw new Error("anime3rb: search component not found");
  }

  async detail(url) {
    const abs = this.toAbsolute(url);
    const match = abs.match(/\/episode\/([^/?#]+)/);
    const seriesUrl = match ? `${this.base}/titles/${match[1]}` : abs;
    let html = "";
    try {
      html = await this.get(seriesUrl);
    } catch (e) {
      html = "";
    }
    if (!html || html.indexOf("video-list") < 0) {
      if (seriesUrl !== abs) html = await this.get(abs);
    }
    if (!html) throw new Error(`anime3rb: cannot load ${abs}`);

    const title = await this.seriesTitle(html);
    const cover = (await this.getAttributeText(html, 'img[alt*="بوستر"]', "src")) || "";
    const desc = await this.synopsis(html);

    const list = await this.querySelectorAll(html, ".video-list a");
    const episodes = [];
    for (const item of list) {
      const inner = item.content;
      const href = await this.getAttributeText(inner, "a", "href");
      if (!href) continue;
      const name = this.clean(await this.querySelector(inner, ".video-data").text);
      const number = (href.match(/\/episode\/[^/]+\/(\d+)/) || [])[1];
      episodes.push({
        name: name || `الحلقة ${number || episodes.length + 1}`,
        url: this.toAbsolute(href),
      });
    }

    return {
      title,
      cover,
      desc,
      episodes: [{ title: "الحلقات", urls: episodes.reverse() }],
    };
  }

  async seriesTitle(html) {
    const span = this.clean(await this.querySelector(html, "h1 > span").text);
    if (span) return span;
    const heading = this.clean(await this.querySelector(html, "h1").text);
    return heading.replace(/\s*الحلقة\s*\d+.*$/, "").trim() || "Anime3rb";
  }

  async synopsis(html) {
    const index = html.indexOf("video-list");
    const head = index > 0 ? html.slice(0, index) : html;
    const paragraphs = await this.querySelectorAll(head, "p");
    const noise = /(javascript|جافاسكريبت|enable\s+js|cloudflare|cookies|verifica)/i;
    let best = "";
    for (const paragraph of paragraphs) {
      const text = this.clean(await this.querySelector(paragraph.content, "p").text);
      if (noise.test(text)) continue;
      if (text.length > best.length) best = text;
    }
    if (best.length > 80) return best;
    return (await this.getAttributeText(html, 'meta[name="description"]', "content")) || "";
  }

  async watch(url) {
    const page = await this.get(this.toAbsolute(url));
    const found = page.match(/&quot;video_url&quot;:&quot;(.*?)&quot;/);
    if (!found) throw new Error("anime3rb: player url not found");
    const playerUrl = found[1].replace(/\\\//g, "/").replace(/&amp;/g, "&");

    const player = await this.req(playerUrl, {
      headers: {
        Referer: `${this.player}/`,
        Origin: this.base,
        "Sec-Fetch-Dest": "iframe",
        "Sec-Fetch-Site": "cross-site",
      },
    });
    const text = typeof player === "string" ? player : String(player || "");

    const sources = [];
    const regex = /var\s+video_sources\s*=\s*(\[[\s\S]*?\]);/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      try {
        const list = JSON.parse(match[1]);
        if (Array.isArray(list)) sources.push(...list);
      } catch (e) {}
    }

    const free = [];
    for (const source of sources) {
      if (!source || source.premium || !source.src) continue;
      const quality = parseInt(String(source.res || source.label || "").replace(/\D/g, ""), 10) || 0;
      free.push({ quality, url: String(source.src).replace(/\\\//g, "/") });
    }
    if (free.length === 0) throw new Error("anime3rb: no free source available");
    free.sort((a, b) => b.quality - a.quality);

    return {
      type: "mp4",
      url: free[0].url,
      headers: {
        "User-Agent": this.ua,
        Referer: `${this.player}/`,
      },
    };
  }
}
