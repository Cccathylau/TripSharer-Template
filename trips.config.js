export const TRIPS = {
  "my-trip-2026": {
    databaseId: "YOUR_PLACES_DATABASE_ID",
    overviewPageId: "YOUR_OVERVIEW_PAGE_ID",
    cityPageIds: {
      city1: "YOUR_CITY1_PAGE_ID",
      city2: "YOUR_CITY2_PAGE_ID"
    },
    citySearchTerms: {
      city1: "City1 Name, Country",
      city2: "City2 Name, Country"
    },
    cityColors: {
      city1: "#E85D4A",
      city2: "#2A9D8F"
    },
    // 城区核心 bbox [south, west, north, east]，用于路网抓取
    cityUrbanBBox: {
      city1: [LAT_S, LNG_W, LAT_N, LNG_E],
      city2: [LAT_S, LNG_W, LAT_N, LNG_E]
    },
    // 百度地图搜索用的城市中文名（国际城市填英文即可）
    cityZhNames: {
      city1: "City1",
      city2: "City2"
    },
    // "international" or "domestic" (China mainland, uses Amap geocoding)
    region: "international",
    countryName: "Your Country",
    theme: { primary: "#E85D4A" },
    siteUrl: "https://your-username.github.io/TripSharer-Template",
    coverMeta: {
      title: "My Trip 2026",
      description: "City1 · City2",
      boundaryCity: "city1",
      boundarySlice: [0, 100],
      coverPhoto: 1
    }
  }
}
