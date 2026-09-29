// Major centralized exchanges tracked by CoinMarketCap.
// IDs come from /v1/exchange/map and stay stable when names change.
export const EXCHANGES = [
  { id: 270, slug: "binance", name: "Binance", short: "BN" },
  { id: 89, slug: "coinbase-exchange", name: "Coinbase", short: "CB" },
  { id: 521, slug: "bybit", name: "Bybit", short: "BY" },
  { id: 294, slug: "okx", name: "OKX", short: "OK" },
  { id: 24, slug: "kraken", name: "Kraken", short: "KR" },
  { id: 311, slug: "kucoin", name: "KuCoin", short: "KC" },
  { id: 302, slug: "gate", name: "Gate", short: "GT" },
  { id: 513, slug: "bitget", name: "Bitget", short: "BG" },
  { id: 544, slug: "mexc", name: "MEXC", short: "MX" },
  { id: 102, slug: "htx", name: "HTX", short: "HT" },
  { id: 1149, slug: "crypto-com-exchange", name: "Crypto.com", short: "CR" },
  { id: 351, slug: "upbit", name: "Upbit", short: "UP" },
  { id: 37, slug: "bitfinex", name: "Bitfinex", short: "BF" },
  { id: 70, slug: "bitstamp", name: "Bitstamp", short: "BS" },
  { id: 151, slug: "gemini", name: "Gemini", short: "GM" },
];

export function exchangeBySlug(slug) {
  return EXCHANGES.find((exchange) => exchange.slug === slug) || null;
}
