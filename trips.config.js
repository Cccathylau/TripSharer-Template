export const TRIPS = {
  "my-trip": {
    databaseId: "",
    overviewPageId: "",
    cityPageIds: {
      sydney: "",
      melbourne: ""
    },
    citySearchTerms: {
      sydney: "Sydney, Australia",
      melbourne: "Melbourne, Australia"
    },
    cityColors: {
      sydney: "#E85D4A",
      melbourne: "#2A9D8F"
    },
    // 城区核心 bbox [south, west, north, east]，用于路网抓取
    cityUrbanBBox: {},
    // 百度地图搜索用的城市中文名（国际城市填英文即可）
    cityZhNames: {
      sydney: "Sydney",
      melbourne: "Melbourne"
    },
    // "international" or "domestic" (China mainland, uses Amap geocoding)
    region: "international",
    countryName: "Australia",
    theme: { primary: "#E85D4A" },
    siteUrl: "https://cccathylau.github.io/TripSharer-Template",
    coverMeta: {
      title: "My Trip",
      description: "Sydney · Melbourne",
      boundaryCity: "sydney",
      coverPhoto: 1
    }
  }
}
