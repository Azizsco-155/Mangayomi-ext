const mangayomiSources = [
  {
    name: "Voir-Anime",
    lang: "fr",
    baseUrl: "https://voir-anime.to",
    apiUrl: "",
    iconUrl: "https://voir-anime.to/wp-content/uploads/2019/12/vato.png",
    typeSource: "single",
    isManga: false,
    isNsfw: false,
    version: "1.0.1",
    dateFormat: "dd/MM/yyyy",
    dateFormatLocale: "fr",
    pkgPath: "anime/src/fr/voiranime.js",
  },
];

class DefaultExtension extends MProvider {
  constructor() {
    super();
    this.client = new Client();
  }

  getHeaders(url) {
    return {
      Referer: this.source.baseUrl + "/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    };
  }

  getUrl(path) {
    if (!path) return this.source.baseUrl + "/";
    const value = String(path);
    if (value.startsWith("http")) return value;
    return this.source.baseUrl + (value.startsWith("/") ? "" : "/") + value;
  }

  getText(element) {
    return element ? String(element.text || "").trim() : "";
  }

  getImageUrl(element) {
    if (!element) return null;
    const value =
      element.attr("data-src") ||
      element.attr("data-lazy-src") ||
      element.attr("src") ||
      element.getSrc ||
      "";
    return String(value).trim() || null;
  }

  getAnimeItems(document) {
    const list = [];
    const seen = {};
    const selectors = [
      ".page-item-detail.video",
      ".page-item-detail",
      ".c-tabs-item__content",
      ".c-image-hover",
    ];

    for (const selector of selectors) {
      for (const element of document.select(selector)) {
        const linkElement =
          element.selectFirst(".item-summary .post-title a") ||
          element.selectFirst(".tab-summary .post-title a") ||
          element.selectFirst(".post-title a") ||
          element.selectFirst("a[href*='/anime/']");
        if (!linkElement) continue;

        const link = linkElement.getHref;
        const name = this.getText(linkElement);
        const image = this.getImageUrl(
          element.selectFirst(".item-thumb img") ||
            element.selectFirst(".tab-thumb img") ||
            element.selectFirst("img")
        );
        if (!link || !link.includes("/anime/") || !name || seen[link]) continue;
        seen[link] = true;
        list.push({ name, imageUrl: image, link });
      }
    }

    if (list.length === 0) {
      for (const linkElement of document.select("a[href*='/anime/']")) {
        const link = linkElement.getHref;
        if (!link) continue;
        const cleanLink = link.split("?")[0].replace(/\/+$/, "");
        const animePart = cleanLink.substring(cleanLink.indexOf("/anime/") + 7);
        if (!animePart || animePart.includes("/") || seen[link]) continue;

        const name =
          this.getText(linkElement) ||
          String(linkElement.attr("title") || "").trim();
        if (!name) continue;

        seen[link] = true;
        list.push({
          name,
          imageUrl: this.getImageUrl(linkElement.selectFirst("img")),
          link,
        });
      }
    }

    return list;
  }

  async getAnimeList(path) {
    const url = this.getUrl(path);
    const response = await this.client.get(url, this.getHeaders(url));
    const document = new Document(response.body || "");
    const list = this.getAnimeItems(document);
    return { list, hasNextPage: list.length >= 20 };
  }

  getPagedPath(path, page) {
    if (page <= 1) return path;
    const queryIndex = path.indexOf("?");
    if (queryIndex >= 0) {
      const pathname = path.slice(0, queryIndex).replace(/\/$/, "");
      const query = path.slice(queryIndex + 1);
      return pathname + "/page/" + page + "/?" + query;
    }
    return path.replace(/\/$/, "") + "/page/" + page + "/";
  }

  async getPopular(page) {
    return await this.getAnimeList(this.getPagedPath("/?m_orderby=trending", page));
  }

  get supportsLatest() {
    return true;
  }

  async getLatestUpdates(page) {
    return await this.getAnimeList(this.getPagedPath("/nouveaux-ajouts/", page));
  }

  async search(query, page, filters) {
    const base = "/?s=" + encodeURIComponent(query) + "&post_type=wp-manga";
    return await this.getAnimeList(this.getPagedPath(base, page));
  }

  statusCode(text) {
    const value = String(text || "").toLowerCase();
    if (value.includes("termin")) return 1;
    if (value.includes("en cours")) return 0;
    if (value.includes("annul")) return 3;
    if (value.includes("pause")) return 2;
    return 5;
  }

  getSummaryValue(document, label) {
    for (const item of document.select(".summary_content .post-content_item")) {
      const heading = this.getText(item.selectFirst(".summary-heading"));
      if (heading.toLowerCase().includes(label.toLowerCase())) {
        return this.getText(item.selectFirst(".summary-content"));
      }
    }
    return "";
  }

  async getDetail(url) {
    const detailUrl = this.getUrl(url);
    const response = await this.client.get(detailUrl, this.getHeaders(detailUrl));
    const document = new Document(response.body || "");

    const title = this.getText(
      document.selectFirst(".summary_content .post-title h1") ||
        document.selectFirst("h1")
    );
    const image = this.getImageUrl(
      document.selectFirst(".summary_image img")
    );
    const description = this.getText(
      document.selectFirst(".description-summary .summary__content")
    );
    const status = this.getSummaryValue(document, "Status");
    const genres = [];
    for (const genre of document.select(".genres-content a")) {
      const value = this.getText(genre);
      if (value) genres.push(value);
    }

    const episodes = [];
    for (const chapter of document.select("li.wp-manga-chapter")) {
      const linkElement = chapter.selectFirst("a[href*='/anime/']");
      if (!linkElement) continue;
      const name = this.getText(linkElement);
      const chapterUrl = linkElement.getHref;
      const dateText = this.getText(chapter.selectFirst(".chapter-release-date"));
      if (name && chapterUrl) {
        episodes.push({
          name,
          url: chapterUrl,
          scanlator: "Voir-Anime",
          dateUpload: /\d{4}-\d{2}-\d{2}/.test(dateText)
            ? String(Date.parse(dateText))
            : null,
        });
      }
    }

    return {
      name: title,
      description,
      author: "",
      link: detailUrl,
      imageUrl: image,
      genre: genres,
      status: this.statusCode(status),
      episodes,
    };
  }

  extractVideoUrls(html) {
    const urls = [];
    const pattern = /<iframe[^>]+src=["']([^"']+)["']/gi;
    let match;
    while ((match = pattern.exec(html || "")) !== null) {
      const value = match[1].replace(/\\\//g, "/");
      if (value && urls.indexOf(value) === -1) urls.push(value);
    }
    return urls;
  }

  async resolveVideo(url, pageUrl) {
    const response = await this.client.get(url, this.getHeaders(pageUrl));
    const html = response.body || "";
    const matches = [
      html.match(/https?:[^"' ]+\.m3u8[^"' ]*/i),
      html.match(/https?:[^"' ]+\.mp4[^"' ]*/i),
      html.match(/["']file["']\s*:\s*["']([^"']+)["']/i),
    ];
    for (const match of matches) {
      if (match) return (match[1] || match[0]).replace(/\\\//g, "");
    }
    return url;
  }

  async getVideoList(url) {
    const episodeUrl = this.getUrl(url);
    const response = await this.client.get(episodeUrl, this.getHeaders(episodeUrl));
    const iframeUrls = this.extractVideoUrls(response.body || "");
    const videos = [];

    for (const iframeUrl of iframeUrls) {
      const playable = await this.resolveVideo(iframeUrl, episodeUrl);
      let quality = "Lecteur";
      if (iframeUrl.includes("voembed")) quality = "myTV";
      else if (iframeUrl.includes("mfw09")) quality = "MOON";
      else if (iframeUrl.includes("voe.")) quality = "VOE";
      else if (iframeUrl.includes("streamtape")) quality = "Stape";
      videos.push({ url: playable, originalUrl: iframeUrl, quality });
    }

    return videos;
  }

  async getPageList() {
    return [];
  }
}
