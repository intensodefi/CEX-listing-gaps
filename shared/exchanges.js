export const REGIONS = [
  { id: "all", name: "All regions" },
  { id: "us", name: "United States" },
  { id: "kr", name: "South Korea" },
  { id: "jp", name: "Japan" },
  { id: "eu", name: "Europe" },
  { id: "global", name: "Global" },
];

export const MARKETS = [
  { id: "spot", name: "Spot" },
  { id: "perpetual", name: "Perpetual" },
  { id: "futures", name: "Futures" },
];

// Primary region is the exchange's home market, not every country it serves.
export const EXCHANGES = [
  { id: 89, slug: "coinbase-exchange", name: "Coinbase", short: "CB", region: "us" },
  { id: 24, slug: "kraken", name: "Kraken", short: "KR", region: "us" },
  { id: 151, slug: "gemini", name: "Gemini", short: "GM", region: "us" },
  { id: 630, slug: "binance-us", name: "Binance.US", short: "BU", region: "us" },
  { id: 351, slug: "upbit", name: "Upbit", short: "UP", region: "kr" },
  { id: 200, slug: "bithumb", name: "Bithumb", short: "BH", region: "kr" },
  { id: 174, slug: "coinone", name: "Coinone", short: "CO", region: "kr" },
  { id: 194, slug: "korbit", name: "Korbit", short: "KB", region: "kr" },
  { id: 335, slug: "gopax", name: "GOPAX", short: "GP", region: "kr" },
  { id: 139, slug: "bitflyer", name: "bitFlyer", short: "FY", region: "jp" },
  { id: 257, slug: "bitbank", name: "Bitbank", short: "BB", region: "jp" },
  { id: 106, slug: "coincheck", name: "Coincheck", short: "CK", region: "jp" },
  { id: 70, slug: "bitstamp", name: "Bitstamp", short: "BS", region: "eu" },
  { id: 520, slug: "bitvavo", name: "Bitvavo", short: "BV", region: "eu" },
  { id: 270, slug: "binance", name: "Binance", short: "BN", region: "global" },
  { id: 521, slug: "bybit", name: "Bybit", short: "BY", region: "global" },
  { id: 294, slug: "okx", name: "OKX", short: "OK", region: "global" },
  { id: 311, slug: "kucoin", name: "KuCoin", short: "KC", region: "global" },
  { id: 302, slug: "gate", name: "Gate", short: "GT", region: "global" },
  { id: 513, slug: "bitget", name: "Bitget", short: "BG", region: "global" },
  { id: 544, slug: "mexc", name: "MEXC", short: "MX", region: "global" },
  { id: 102, slug: "htx", name: "HTX", short: "HT", region: "global" },
  { id: 1149, slug: "crypto-com-exchange", name: "Crypto.com", short: "CR", region: "global" },
];

export function exchangesInRegion(exchanges, region) {
  if (!region || region === "all") return exchanges;
  return exchanges.filter((exchange) => exchange.region === region);
}

export function exchangeBySlug(slug) {
  return EXCHANGES.find((exchange) => exchange.slug === slug) || null;
}

export function regionName(region) {
  return REGIONS.find((item) => item.id === region)?.name || region;
}
