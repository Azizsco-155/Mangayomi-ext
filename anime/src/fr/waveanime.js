const mangayomiSources = [
  {
    name: "WaveAnime",
    lang: "fr",
    baseUrl: "https://waveanime.fr",
    apiUrl: "",
    iconUrl: "https://waveanime.fr/favicon.ico",
    typeSource: "single",
    isManga: false,
    isNsfw: false,
    version: "1.0.2",
    dateFormat: "",
    dateFormatLocale: "fr-FR",
    pkgPath: "anime/src/fr/waveanime.js",
  },
];

class DefaultExtension extends MProvider {
  constructor() {
    super();
    this.client = new Client();
  }

  getHeaders() {
    return {
      Referer: `${this.source.baseUrl}/`,
      Accept: "application/json",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    };
  }

  getApiUrl(path) {
    const apiBase = String(this.source.baseUrl).replace(/\/$/, "") + "/api";
    return apiBase + (String(path).startsWith("/") ? String(path) : `/${path}`);
  }

  async request(path) {
    const url = this.getApiUrl(path);
    const response = await this.client.get(url, this.getHeaders());
    return JSON.parse(response.body);
  }

  mediaUrl(path) {
    return `${this.source.baseUrl}${path}`;
  }

  toListItem(item) {
    const id = item.id;
    return {
      name: item.title || "Titre inconnu",
      imageUrl: this.mediaUrl(`/media/posters/${id}-small.jpeg`),
      link: `${this.source.baseUrl}/serie/${id}`,
    };
  }

  async getPopular(page) {
    if (page > 1) return { list: [], hasNextPage: false };
    const data = await this.request("/series?order=a-z&limit=100");
    return {
      list: data.map((item) => this.toListItem(item)),
      hasNextPage: false,
    };
  }

  async getLatestUpdates(page) {
    if (page > 1) return { list: [], hasNextPage: false };
    const data = await this.request("/series?order=latest&limit=100");
    return {
      list: data.map((item) => this.toListItem(item)),
      hasNextPage: false,
    };
  }

  get supportsLatest() {
    return true;
  }

  async search(query, page) {
    if (page > 1) return { list: [], hasNextPage: false };
    const encodedQuery = encodeURIComponent(query.trim());
    if (!encodedQuery) return { list: [], hasNextPage: false };
    const data = await this.request(`/series?query=${encodedQuery}&limit=100`);
    return {
      list: data.map((item) => this.toListItem(item)),
      hasNextPage: false,
    };
  }

  getId(value) {
    const text = String(value);
    const match = text.match(/(?:serie|watch)\/([^/?#]+)/);
    return match ? match[1] : text.replace(/^\//, "");
  }

  async getDetail(url) {
    const id = this.getId(url);
    const data = await this.request(`/series/${id}`);
    const serie = data.serie || {};
    const seasons = data.seasons || [];
    const episodes = data.episodes || [];
    const firstSeason = seasons.length > 0 ? seasons[0] : {};

    const genres = [];
    for (const genre of data.genres || []) genres.push(genre.name);
    for (const theme of data.themes || []) genres.push(theme.name);

    const title =
      serie.title_fra ||
      serie.title_eng ||
      serie.title_jpn ||
      "Titre inconnu";

    const episodeList = episodes
      .slice()
      .sort((a, b) => {
        if ((a.season_number || 1) !== (b.season_number || 1)) {
          return (a.season_number || 1) - (b.season_number || 1);
        }
        return (a.number || 0) - (b.number || 0);
      })
      .map((episode) => ({
        name: `S${episode.season_number || 1} E${episode.number || 0}${
          episode.title ? ` - ${episode.title}` : ""
        }`,
        url: `${this.source.baseUrl}/watch/${episode.id}`,
        scanlator: "WaveAnime",
        dateUpload: episode.created_timestamp
          ? String(episode.created_timestamp)
          : null,
      }));

    return {
      name: title,
      link: `${this.source.baseUrl}/serie/${id}`,
      imageUrl: this.mediaUrl(`/media/posters/${id}-large.jpeg`),
      description: firstSeason.synopsis || "",
      author: "",
      genre: genres,
      status: 5,
      episodes: episodeList,
    };
  }

  async getVideoList(url) {
    const episodeId = this.getId(url);
    const manifest = this.mediaUrl(`/playback/${episodeId}/manifest.mpd`);
    return [
      {
        url: manifest,
        originalUrl: manifest,
        quality: "MPEG-DASH",
      },
    ];
  }

  async getPageList() {
    return [];
  }
}
