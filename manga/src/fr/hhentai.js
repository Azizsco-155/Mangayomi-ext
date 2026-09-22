const mangayomiSources = [
  {
    name: "HHentai",
    lang: "fr",
    baseUrl: "https://hhentai.fr",
    iconUrl: "https://www.google.com/s2/favicons?sz=128&domain=https://hhentai.fr",
    typeSource: "single",
    isManga: true,
    itemType: 0,
    hasCloudflare: false,
    version: "0.1.3",
    pkgPath: "manga/src/fr/hhentai.js",
  },
];

class DefaultExtension extends MProvider {
  constructor() {
    super();
    this.baseUrl = "https://hhentai.fr";
    this.client = new Client();
  }

  getBaseUrl() { return this.baseUrl; }
  getName() { return "HHentai"; }
  getLanguage() { return "fr"; }

  getImageUrl(img) {
    if (!img) return "";

    const attributes = [
      "data-src",
      "data-lazy-src",
      "data-original",
      "data-original-src",
      "data-url",
      "src",
      "data-srcset",
      "srcset",
    ];

    for (let i = 0; i < attributes.length; i++) {
      const value = img.attr(attributes[i]);
      const imageUrl = this.cleanImageUrl(value);
      if (imageUrl) return imageUrl;
    }

    return "";
  }

  hasNextPage(doc, currentPage) {
    const options = doc.select("div.wp-pagenavi option");

    for (let i = 0; i < options.length; i++) {
      const pageNumber = parseInt(options[i].text.trim(), 10);
      if (!isNaN(pageNumber) && pageNumber > currentPage) return true;
    }

    return doc.selectFirst("a.next, .next-page, .pagination a.active + a") != null;
  }

  async getPopular(page) {
    const url = page == 1
      ? this.baseUrl + "/manga/"
      : this.baseUrl + "/manga/page/" + page + "/";

    const res = await this.client.get(url);
    const doc = new Document(res.body);

    let items = doc.select("div.page-item-detail.manga");
    if (items.length == 0) items = doc.select("div.page-item-detail");

    const list = [];
    const seen = {};

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      const a = item.selectFirst("h3 a, h4 a, .manga-title a, a[href*='/manga/']");
      if (!a || !a.attr("href")) continue;

      const link = this.cleanImageUrl(a.attr("href"));
      if (!link || seen[link]) continue;
      seen[link] = true;

      const img = item.selectFirst("img");
      const image = this.getImageUrl(img);

      list.push({
        name: a.text.trim(),
        link: link,
        imageUrl: image,
      });
    }

    return {
      list: list,
      hasNextPage: this.hasNextPage(doc, page),
    };
  }

  async getLatestUpdates(page) {
    return await this.getPopular(page);
  }

  async search(query, page, filters) {
    const encodedQuery = encodeURIComponent(query);
    const url = page == 1
      ? this.baseUrl + "/?s=" + encodedQuery + "&post_type=wp-manga"
      : this.baseUrl + "/page/" + page + "/?s=" + encodedQuery + "&post_type=wp-manga";

    const res = await this.client.get(url);
    const doc = new Document(res.body);

    let items = doc.select("div.c-tabs-item__content");
    if (items.length == 0) items = doc.select("div.page-item-detail.manga");

    const list = [];
    const seen = {};

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const a = item.selectFirst("a[href*='/manga/'], h3 a, h4 a");

      if (!a || !a.attr("href")) continue;

      const href = a.attr("href");
      if (!href.includes("/manga/")) continue;

      const link = this.cleanImageUrl(href);
      if (!link || seen[link]) continue;
      seen[link] = true;

      const img = item.selectFirst("img");
      const image = this.getImageUrl(img);

      list.push({
        name: (a.attr("title") || a.text).trim(),
        link: link,
        imageUrl: image,
      });
    }

    return { list: list, hasNextPage: this.hasNextPage(doc, page) };
  }

  async getDetail(url) {
    url = this.cleanImageUrl(url);
    const res = await this.client.get(url);
    const doc = new Document(res.body);

    let titleEl = doc.selectFirst("div.post-title h1, h1.entry-title, .manga-title");
    const title = titleEl ? titleEl.text.trim() : "";

    const imgEl = doc.selectFirst("div.summary_image img, .manga-poster img, .post-img img");
    const imageUrl = this.getImageUrl(imgEl);

    let descEl = doc.selectFirst(
      "div.description-summary div.summary__content, " +
      "div.summary_content, .manga-excerpt.summary__content, .post-content_item p"
    );
    const description = descEl ? descEl.text.trim() : "";

    let authorEl = doc.selectFirst("div.author-content a, .author a, .manga-author a");
    const author = authorEl ? authorEl.text.trim() : "";

    const genreEls = doc.select("div.genres-content a, .manga-genre a, .tag a");
    const genre = [];
    for (let i = 0; i < genreEls.length; i++) {
      genre.push(genreEls[i].text.trim());
    }

    const chapterLis = doc.select("div.listing-chapters_wrap li.wp-manga-chapter");
    const chapters = [];

    for (let i = 0; i < chapterLis.length; i++) {
      const li = chapterLis[i];
      const a = li.selectFirst("a");
      if (!a || !a.attr("href")) continue;

      let rawName = a.text.trim();

      let match = rawName.match(/(\d+(\.\d+)?)/);
      let num = match ? parseFloat(match[1]) : (chapterLis.length - i);

      let cleanName = rawName;
      if (!cleanName.toLowerCase().includes("chapitre")) {
        cleanName = "Chapitre " + num;
        if (rawName.length > 15) {
          cleanName += " - " + rawName;
        }
      }

      chapters.push({
        name: cleanName,
        url: a.attr("href"),
        dateUpload: String(Date.now() - i * 86400000),
      });
    }

    return {
      name: title,
      link: url,
      imageUrl: imageUrl,
      description: description,
      author: author,
      genre: genre,
      status: 0,
      chapters: chapters,
    };
  }

  async getPageList(url) {
    const res = await this.client.get(url);
    const doc = new Document(res.body);

    let imgs = doc.select("div.reading-content img.wp-manga-chapter-img");
    if (imgs.length == 0) imgs = doc.select("img.wp-manga-chapter-img");
    if (imgs.length == 0) imgs = doc.select("div.reading-content img");

    const pages = [];
    for (let i = 0; i < imgs.length; i++) {
      let src = this.getImageUrl(imgs[i]);
      if (!src) continue;

      if (src.startsWith("data:")) continue;
      if (src.includes("placeholder")) continue;
      if (src.length < 10) continue;

      if (pages.indexOf(src) == -1) pages.push(src);
    }

    return pages;
  }

  cleanImageUrl(url) {
    if (!url || url.length < 5) return "";

    url = url.trim().split(/\s+/)[0];

    if (url.startsWith("data:")) return "";
    if (url.includes("placeholder")) return "";

    if (url.startsWith("//")) return "https:" + url;
    if (url.startsWith("/")) return this.baseUrl + url;
    if (!/^https?:\/\//i.test(url)) return this.baseUrl + "/" + url;

    return url;
  }

  getFilterList() {
    return [];
  }

  getSourcePreferences() {
    return [];
  }
}
