const mangayomiSources = [
  {
    name: "Hentai Origines",
    lang: "fr",
    baseUrl: "https://hentai-origines.com",
    apiUrl: "",
    iconUrl: "https://hentai-origines.com/wp-content/uploads/2026/09/cropped-icon_HO-192x192.png",
    typeSource: "single",
    isManga: true,
    isNsfw: true,
    version: "1.0.1",
    dateFormat: "dd/MM/yy",
    dateFormatLocale: "fr",
    pkgPath: "manga/src/fr/hentaiorigines.js",
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
    return (
      this.source.baseUrl +
      (value.startsWith("/") ? "" : "/") +
      value
    );
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

  getMangaItems(doc) {
    const list = [];
    const seen = {};
    const elements = doc.select("a.ori-card");

    for (const element of elements) {
      const link = element.getHref;
      const titleElement = element.selectFirst(".ori-card-title");
      const imageElement = element.selectFirst("img");
      const name = this.getText(titleElement) || this.getText(element);

      if (!link || !link.includes("/manga/") || !name) continue;
      if (seen[link]) continue;
      seen[link] = true;

      list.push({
        name,
        imageUrl: this.getImageUrl(imageElement),
        link,
      });
    }

    if (list.length === 0) {
      for (const element of doc.select(".c-tabs-item__content")) {
        const linkElement = element.selectFirst("a[href*='/manga/']");
        if (!linkElement) continue;
        const link = linkElement.getHref;
        const name = this.getText(
          element.selectFirst(".tab-summary .post-title") ||
            element.selectFirst(".post-title") ||
            linkElement
        );
        const image = element.selectFirst("img");
        if (link && name) {
          list.push({ name, imageUrl: this.getImageUrl(image), link });
        }
      }
    }

    return list;
  }

  async getMangaList(path) {
    const url = this.getUrl(path);
    const response = await this.client.get(url, this.getHeaders(url));
    const document = new Document(response.body || "");
    const list = this.getMangaItems(document);
    return {
      list,
      hasNextPage: list.length >= 30,
    };
  }

  getPagedPath(path, page) {
    if (page <= 1) return path;
    return path + (path.indexOf("?") >= 0 ? "&" : "?") + "manga-paged=" + page;
  }

  async getPopular(page) {
    const path = this.getPagedPath("/catalogue/?m_orderby=trending", page);
    return await this.getMangaList(path);
  }

  get supportsLatest() {
    return true;
  }

  async getLatestUpdates(page) {
    const path = this.getPagedPath("/catalogue/", page);
    return await this.getMangaList(path);
  }

  async search(query, page) {
    const path = this.getPagedPath(
      "/?s=" + encodeURIComponent(query) + "&post_type=wp-manga",
      page
    );
    return await this.getMangaList(path);
  }

  statusCode(text) {
    const value = String(text || "").toLowerCase();
    if (value.includes("termin")) return 1;
    if (value.includes("en cours")) return 0;
    if (value.includes("pause") || value.includes("hiatus")) return 2;
    return 5;
  }

  parseDate(text) {
    const match = String(text || "").match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (!match) return null;
    let year = parseInt(match[3], 10);
    if (year < 100) year += 2000;
    return String(new Date(year, parseInt(match[2], 10) - 1, parseInt(match[1], 10)).valueOf());
  }

  async getDetail(url) {
    const detailUrl = this.getUrl(url);
    const response = await this.client.get(detailUrl, this.getHeaders(detailUrl));
    const document = new Document(response.body || "");

    const title = this.getText(
      document.selectFirst(".ori-sr-title") || document.selectFirst("h1")
    );
    const cover = this.getImageUrl(
      document.selectFirst(".ori-sr-cover img") || document.selectFirst(".summary_image img")
    );
    const description = this.getText(
      document.selectFirst(".ori-sr-syn-texte") ||
        document.selectFirst(".description-summary") ||
        document.selectFirst("meta[name='description']")
    );
    const statusText = this.getText(document.selectFirst(".ori-sr-badge-statut"));
    const genres = [];
    for (const genre of document.select(".ori-sr-genre")) {
      const value = this.getText(genre);
      if (value && genres.indexOf(value) === -1) genres.push(value);
    }

    const chapters = [];
    for (const row of document.select(".ori-chl-row")) {
      const linkElement =
        row.selectFirst("a.ori-chl-corps") || row.selectFirst("a[href*='/chapitre-']");
      if (!linkElement) continue;
      const chapterUrl = linkElement.getHref;
      const name =
        this.getText(row.selectFirst(".ori-chl-nom-long")) ||
        this.getText(row.selectFirst(".ori-chl-nom-court")) ||
        this.getText(linkElement);
      const dateText = this.getText(row.selectFirst(".ori-chl-date"));
      if (chapterUrl && name) {
        chapters.push({
          name,
          url: chapterUrl,
          scanlator: "Hentai Origines",
          dateUpload: this.parseDate(dateText),
        });
      }
    }

    return {
      name: title,
      description,
      link: detailUrl,
      imageUrl: cover,
      status: this.statusCode(statusText),
      genre: genres,
      chapters,
    };
  }

  async getPageList(url) {
    const chapterUrl = this.getUrl(url);
    const response = await this.client.get(chapterUrl, this.getHeaders(chapterUrl));
    const document = new Document(response.body || "");
    const pages = [];

    for (const image of document.select(".reading-content img.wp-manga-chapter-img")) {
      const imageUrl = this.getImageUrl(image);
      if (!imageUrl) continue;
      pages.push({
        url: imageUrl,
        headers: this.getHeaders(chapterUrl),
      });
    }

    return pages;
  }
}
