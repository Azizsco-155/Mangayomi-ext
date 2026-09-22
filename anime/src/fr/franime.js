const mangayomiSources = [
  {
    name: "FRAnime",
    lang: "fr",
    baseUrl: "https://franime.fr",
    apiUrl: "https://api.franime.fr/api/",
    iconUrl: "https://franime.fr/logo.png",
    typeSource: "single",
    isManga: false,
    isNsfw: false,
    version: "1.0.2",
    pkgPath: "anime/src/fr/franime.js",
  },
];

class DefaultExtension extends MProvider {
  constructor() {
    super();
    this.api = "https://api.franime.fr/api/";
    this.client = new Client();
  }

  async json(path) {
    const response = await this.client.get(this.api + path, {
      Referer: "https://franime.fr/",
      "User-Agent": "Mozilla/5.0",
      Accept: "application/json",
    });
    return JSON.parse(response.body || "null");
  }

  slug(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  animeUrl(anime) {
    return this.source.baseUrl + "/anime/" + this.slug(anime.title) + "?anime_id=" + anime.id;
  }

  item(anime) {
    return {
      name: anime.title || anime.titleO || "Sans titre",
      imageUrl: anime.affiche || anime.affiche_small || anime.banner,
      link: this.animeUrl(anime),
    };
  }

  async getPopular(page) {
    if (page > 1) return { list: [], hasNextPage: false };
    const data = await this.json("discord/voted/render-top-15-of-bestanimes");
    const list = Array.isArray(data) ? data.map((x) => this.item(x)) : [];
    return { list, hasNextPage: false };
  }

  async getLatestUpdates(page) {
    const data = await this.json("animes");
    const all = Array.isArray(data) ? data.slice() : [];
    all.sort((a, b) => String(b.updatedDateVF || b.updatedDate || "").localeCompare(String(a.updatedDateVF || a.updatedDate || "")));
    const start = (page - 1) * 30;
    const list = all.slice(start, start + 30).map((x) => this.item(x));
    return { list, hasNextPage: start + 30 < all.length };
  }

  async search(query, page, filters) {
    const data = await this.json("animes");
    const q = String(query || "").toLowerCase().trim();
    const all = (Array.isArray(data) ? data : []).filter((anime) => {
      const fields = [anime.title, anime.titleO, anime.description, ...(anime.themes || [])];
      return fields.some((value) => String(value || "").toLowerCase().includes(q));
    });
    const start = (page - 1) * 30;
    const list = all.slice(start, start + 30).map((x) => this.item(x));
    return { list, hasNextPage: start + 30 < all.length };
  }

  statusCode(value) {
    const text = String(value || "").toLowerCase();
    if (text.includes("termin")) return 1;
    if (text.includes("en cours") || text.includes("airing")) return 0;
    if (text.includes("pause")) return 2;
    if (text.includes("annul")) return 3;
    return 5;
  }

  async getDetail(url) {
    const match = String(url).match(/[?&]anime_id=(\d+)/);
    if (!match) throw new Error("Identifiant FRAnime introuvable");
    const anime = await this.json("anime-by-id/" + match[1]);
    const episodes = [];
    for (let s = 0; s < (anime.saisons || []).length; s++) {
      const season = anime.saisons[s];
      for (let e = 0; e < (season.episodes || []).length; e++) {
        const episode = season.episodes[e];
        for (const lang of ["vf", "vo"]) {
          if (!episode.lang || !episode.lang[lang] || !(episode.lang[lang].lecteurs || []).length) continue;
          const number = String(episode.title || "").match(/[0-9]+(?:\.[0-9]+)?/);
          if (!number) continue;
          episodes.push({
            name: season.title + " - " + episode.title + " " + (lang === "vf" ? "VF" : "VOSTFR"),
            url: this.source.baseUrl + "/anime/" + this.slug(anime.title) + "?anime_id=" + anime.id + "&s=" + (s + 1) + "&ep=" + number[0] + "&lang=" + lang + "&si=" + s + "&ei=" + e,
            scanlator: "FRAnime",
          });
        }
      }
    }
    return {
      name: anime.title || anime.titleO,
      description: anime.description || "",
      genre: anime.themes || [],
      status: this.statusCode(anime.status),
      imageUrl: anime.affiche || anime.affiche_small,
      episodes,
    };
  }

  async getVideoList(url) {
    const value = String(url);
    const id = (value.match(/[?&]anime_id=(\d+)/) || [])[1];
    const season = (value.match(/[?&]si=(\d+)/) || [])[1] || "0";
    const episode = (value.match(/[?&]ei=(\d+)/) || [])[1] || "0";
    const lang = (value.match(/[?&]lang=(vf|vo)/) || [])[1] || "vf";
    if (!id || episode === undefined) return [];

    const videos = [];
    const headers = {
      Referer: "https://franime.fr/",
      Origin: "https://franime.fr",
      "User-Agent": "Mozilla/5.0 (Android) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36",
      Accept: "application/json, text/plain, */*",
    };
    try {
      await this.client.get("https://franime.fr/", headers);
    } catch (error) {}
    for (let reader = 0; reader < 4; reader++) {
      try {
        const response = await this.client.get(this.api + "anime/" + id + "/" + season + "/" + episode + "/" + lang + "/" + reader, headers);
        const videoUrl = String(response.body || "").trim().replace(/^\"|\"$/g, "");
        if (videoUrl && videoUrl.startsWith("http") && videoUrl !== this.source.baseUrl) {
          videos.push({
            url: videoUrl,
            originalUrl: videoUrl,
            quality: "FRAnime lecteur " + (reader + 1),
            headers: { Referer: "https://franime.fr/", "User-Agent": headers["User-Agent"] },
          });
        }
      } catch (error) {}
    }
    return videos;
  }
}
