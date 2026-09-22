const mangayomiSources = [
  {
    name: "SushiScan",
    lang: "fr",
    baseUrl: "https://sushiscan.fr",
    apiUrl: "",
    iconUrl: "https://sushiscan.fr/wp-content/uploads/2023/12/bleach.png",
    typeSource: "single",
    isManga: true,
    isNsfw: true,
    version: "1.0.0",
    dateFormat: "MMMM d, yyyy",
    dateFormatLocale: "fr",
    pkgPath: "manga/src/fr/sushiscan.js",
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
    return element ? String(element.text || "").replace(/\s+/g, " ").trim() : "";
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

  getMangaItems(document) {
    const list = [];
    const seen = {};
    const selectors = [
      ".listupd .bsx",
      ".listupd .bs",
      ".page-item-detail",
      ".c-tabs-item__content",
    ];

    for (const selector of selectors) {
      for (const element of document.select(selector)) {
        const linkElement =
          element.selectFirst("a[href*='/catalogue/']") ||
          element.selectFirst("a[href*='/manga/']");
        if (!linkElement) continue;

        const link = linkElement.getHref;
        const title =
          this.getText(element.selectFirst(".tt")) ||
          this.getText(element.selectFirst(".post-title a")) ||
          this.getText(linkElement) ||
          String(linkElement.attr("title") || "").trim();
        const image = this.getImageUrl(
          element.selectFirst("img.ts-post-image") || element.selectFirst("img")
        );

        if (!link || !title || seen[link]) continue;
        seen[link] = true;
        list.push({ name: title, imageUrl: image, link });
      }
    }

    if (list.length === 0) {
      for (const linkElement of document.select("a[href*='/catalogue/']")) {
        const link = linkElement.getHref;
        if (!link || seen[link]) continue;
        const title =
          this.getText(linkElement) ||
          String(linkElement.attr("title") || "").trim();
        if (!title || link.endsWith("/catalogue/")) continue;
        seen[link] = true;
        list.push({
          name: title,
          imageUrl: this.getImageUrl(linkElement.selectFirst("img")),
          link,
        });
      }
    }

    return list;
  }

  async getMangaList(path) {
    const url = this.getUrl(path);
    const response = await this.client.get(url, this.getHeaders(url));
    const document = new Document(response.body || "");
    const list = this.getMangaItems(document);
    return { list, hasNextPage: list.length > 0 };
  }

  getCataloguePath(path, page) {
    if (page <= 1) return path;
    return path + (path.includes("?") ? "&" : "?") + "page=" + page;
  }

  getSearchPath(query, page) {
    const base =
      "/?s=" + encodeURIComponent(query) + "&post_type=wp-manga";
    if (page <= 1) return base;
    return "/page/" + page + base;
  }

  async getPopular(page) {
    return await this.getMangaList(
      this.getCataloguePath("/catalogue/?status=&type=&order=popular", page)
    );
  }

  async getLatestUpdates(page) {
    return await this.getMangaList(
      this.getCataloguePath("/catalogue/?status=&type=&order=update", page)
    );
  }

  async search(query, page, filters) {
    return await this.getMangaList(this.getSearchPath(query, page));
  }

  statusCode(text) {
    const value = String(text || "").toLowerCase();
    if (value.includes("termin")) return 1;
    if (value.includes("en cours")) return 0;
    if (value.includes("pause")) return 2;
    if (value.includes("aband")) return 3;
    return 5;
  }

  getInfoValue(document, label) {
    for (const row of document.select(".infotable tr")) {
      const cells = row.select("td");
      if (cells.length < 2) continue;
      const key = this.getText(cells[0]).toLowerCase();
      if (key.includes(label.toLowerCase())) return this.getText(cells[1]);
    }
    return "";
  }

  parseDate(text) {
    const value = String(text || "").trim();
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? null : String(timestamp);
  }

  async getDetail(url) {
    const detailUrl = this.getUrl(url);
    const response = await this.client.get(detailUrl, this.getHeaders(detailUrl));
    const document = new Document(response.body || "");

    const name = this.getText(document.selectFirst("h1.entry-title"));
    const imageUrl = this.getImageUrl(
      document.selectFirst(".thumb img") || document.selectFirst(".thumb-container img")
    );
    const description = this.getText(
      document.selectFirst(".seriestuhead .entry-content-single") ||
        document.selectFirst(".entry-content-single[itemprop='description']")
    );
    const genres = [];
    for (const genre of document.select(".seriestugenre a")) {
      const value = this.getText(genre);
      if (value && genres.indexOf(value) === -1) genres.push(value);
    }

    const chapters = [];
    for (const row of document.select("#chapterlist li[data-num]")) {
      const linkElement = row.selectFirst("a[href]");
      if (!linkElement) continue;
      const chapterUrl = linkElement.getHref;
      const chapterName = this.getText(row.selectFirst(".chapternum"));
      const dateText = this.getText(row.selectFirst(".chapterdate"));
      if (!chapterUrl || !chapterName) continue;
      chapters.push({
        name: chapterName,
        url: chapterUrl,
        scanlator: "SushiScan",
        dateUpload: this.parseDate(dateText),
      });
    }

    return {
      name,
      description,
      author: this.getInfoValue(document, "Auteur"),
      genre: genres,
      status: this.statusCode(this.getInfoValue(document, "Statut")),
      imageUrl,
      link: detailUrl,
      chapters,
    };
  }

  async getPageList(url) {
    const chapterUrl = this.getUrl(url);
    const response = await this.client.get(chapterUrl, this.getHeaders(chapterUrl));
    const document = new Document(response.body || "");
    const pages = [];
    const imageElements = document.select("#readerarea img").length > 0
      ? document.select("#readerarea img")
      : document.select(".maincontent img");

    for (const image of imageElements) {
      const imageUrl = this.getImageUrl(image);
      if (!imageUrl || imageUrl.includes("readerarea.svg")) continue;
      pages.push({
        url: imageUrl,
        headers: {
          Referer: chapterUrl,
          "User-Agent": "Mozilla/5.0",
        },
      });
    }
    return pages;
  }
}
