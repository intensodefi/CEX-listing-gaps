import { EXCHANGES, MARKETS, REGIONS } from "./exchanges.js";

const MARKET_SHORT = { spot: "S", perpetual: "P", futures: "F" };
const REGION_SHORT = { us: "US", kr: "KR", jp: "JP", eu: "EU", global: "GL" };

export function listingOptions(exchanges = EXCHANGES, regions = REGIONS, markets = MARKETS) {
  const options = [];
  for (const region of regions) {
    if (region.id === "all") continue;
    for (const market of markets) {
      options.push({
        id: `region:${region.id}:${market.id}`,
        kind: "region",
        region: region.id,
        market: market.id,
        group: "Countries",
        name: `${region.name} · ${market.name}`,
        menuName: `${region.name} · ${market.name}`,
        short: `${REGION_SHORT[region.id] || region.id}·${MARKET_SHORT[market.id]}`,
      });
    }
  }
  for (const exchange of exchanges) {
    for (const market of markets) {
      options.push({
        id: `ex:${exchange.slug}:${market.id}`,
        kind: "exchange",
        slug: exchange.slug,
        market: market.id,
        group: exchange.name,
        name: `${exchange.name} · ${market.name}`,
        menuName: market.name,
        short: `${exchange.short}·${MARKET_SHORT[market.id]}`,
      });
    }
  }
  return options;
}

export function resolveListings(books, options, exchanges = EXCHANGES) {
  const resolved = {};
  for (const option of options) {
    resolved[option.id] = option.kind === "region"
      ? resolveRegion(books, option, exchanges)
      : resolveExchange(books, option);
  }
  return resolved;
}

function resolveExchange(books, option) {
  const entry = books?.[option.market]?.[option.slug];
  if (!entry?.ok) {
    return { ok: false, pairCount: 0, assets: [], error: entry?.error || "No pair data yet." };
  }
  return entry;
}

function resolveRegion(books, option, exchanges) {
  const members = exchanges.filter((exchange) => exchange.region === option.region);
  if (!members.length) {
    return { ok: false, pairCount: 0, assets: [], error: "No exchanges in this country." };
  }
  const failed = [];
  const byId = new Map();
  let pairCount = 0;
  for (const member of members) {
    const entry = books?.[option.market]?.[member.slug];
    if (!entry?.ok) {
      failed.push(member.name);
      continue;
    }
    pairCount += entry.pairCount || 0;
    for (const asset of entry.assets || []) {
      const existing = byId.get(asset.id);
      if (!existing) {
        byId.set(asset.id, { ...asset, quotes: [...(asset.quotes || [])] });
        continue;
      }
      existing.pairs = (existing.pairs || 0) + (asset.pairs || 0);
      for (const quote of asset.quotes || []) {
        if (!existing.quotes.includes(quote)) existing.quotes.push(quote);
      }
    }
  }
  if (failed.length) {
    return { ok: false, pairCount: 0, assets: [], error: `Missing pair data for ${failed.join(", ")}.` };
  }
  const assets = [...byId.values()].sort((a, b) => (b.pairs || 0) - (a.pairs || 0) || a.symbol.localeCompare(b.symbol));
  return { ok: true, pairCount, assets };
}
