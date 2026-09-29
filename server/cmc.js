import fs from "node:fs";
import path from "node:path";
import { EXCHANGES } from "../shared/exchanges.js";
import { isStablecoin } from "../shared/compare.js";

const BASE = "https://pro-api.coinmarketcap.com";
const WATCHED = new Set(EXCHANGES.map((exchange) => exchange.id));

const state = {
  phase: "idle",
  done: 0,
  total: 0,
  error: null,
  updatedAt: null,
  universeSize: 0,
  coins: [],
  failures: [],
  cooldownUntil: 0,
};

let refreshPromise = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cachePath() {
  return path.join(process.cwd(), "data", "snapshot.json");
}

function universeSize() {
  const parsed = Number(process.env.UNIVERSE_SIZE || 100);
  if (!Number.isFinite(parsed) || parsed < 1) return 100;
  return Math.min(Math.floor(parsed), 500);
}

function cacheTtl() {
  const parsed = Number(process.env.CACHE_TTL_MS || 20 * 60 * 1000);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 20 * 60 * 1000;
}

export function getState() {
  return {
    phase: state.phase,
    done: state.done,
    total: state.total,
    error: state.error,
    updatedAt: state.updatedAt,
    universeSize: state.universeSize,
    failures: state.failures.map((failure) => ({ id: failure.id, symbol: failure.symbol })),
    coins: state.coins,
    exchanges: EXCHANGES,
  };
}

async function cmcGet(pathname, params) {
  const key = process.env.CMC_API_KEY;
  if (!key) {
    throw new Error("CMC_API_KEY is not set");
  }
  const url = new URL(pathname, BASE);
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, String(value));
  }

  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        "X-CMC_PRO_API_KEY": key,
        Accept: "application/json",
      },
    });
    const body = await response.json().catch(() => ({}));
    const status = body.status || {};
    if (response.ok && status.error_code === 0) return body.data;
    const message = status.error_message || response.statusText || "request failed";
    lastError = new Error(`${pathname} failed (${response.status}): ${message}`);
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === 4) throw lastError;
    await sleep(350 * attempt);
  }
  throw lastError;
}

async function fetchListings(limit) {
  const data = await cmcGet("/v1/cryptocurrency/listings/latest", {
    start: 1,
    limit,
    convert: "USD",
  });
  if (!Array.isArray(data)) {
    throw new Error("Listings response was empty");
  }
  return data;
}

async function fetchExchangeIds(cryptoId) {
  const data = await cmcGet("/v1/exchange/map", {
    crypto_id: cryptoId,
    listing_status: "active",
    limit: 5000,
    aux: "status",
  });
  const ids = new Set();
  if (!Array.isArray(data)) return ids;
  for (const exchange of data) {
    if (WATCHED.has(exchange.id)) ids.add(exchange.id);
  }
  return ids;
}

function toCoin(listing, exchangeIds) {
  const quote = listing.quote?.USD || {};
  const slugs = EXCHANGES.filter((exchange) => exchangeIds.has(exchange.id)).map((exchange) => exchange.slug);
  return {
    id: listing.id,
    rank: listing.cmc_rank,
    symbol: listing.symbol,
    name: listing.name,
    slug: listing.slug,
    price: quote.price ?? null,
    marketCap: quote.market_cap ?? null,
    change24h: quote.percent_change_24h ?? null,
    markets: listing.num_market_pairs ?? null,
    stable: isStablecoin(listing.tags),
    exchanges: slugs,
  };
}

async function pool(items, width, worker) {
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next;
      next += 1;
      await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, () => run()));
}

function readCache() {
  try {
    const raw = fs.readFileSync(cachePath(), "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.coins)) return null;
    if (parsed.universeSize !== universeSize()) return null;
    if (Date.now() - Date.parse(parsed.updatedAt) > cacheTtl()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache() {
  const file = cachePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const payload = {
    version: 1,
    universeSize: state.universeSize,
    updatedAt: state.updatedAt,
    coins: state.coins,
    failures: state.failures,
  };
  fs.writeFileSync(file, JSON.stringify(payload));
}

export function loadFreshCache() {
  const cached = readCache();
  if (!cached) return false;
  state.phase = "ready";
  state.coins = cached.coins;
  state.failures = cached.failures || [];
  state.updatedAt = cached.updatedAt;
  state.universeSize = cached.universeSize;
  state.done = cached.coins.length;
  state.total = cached.universeSize;
  state.error = null;
  return true;
}

async function refreshUncached() {
  const limit = universeSize();
  state.phase = "loading";
  state.error = null;
  state.done = 0;
  state.total = limit;
  state.universeSize = limit;
  state.failures = [];

  const listings = await fetchListings(limit);
  state.total = listings.length;
  const coins = [];
  const failures = [];

  await pool(listings, 16, async (listing) => {
    try {
      const ids = await fetchExchangeIds(listing.id);
      coins.push(toCoin(listing, ids));
    } catch (error) {
      failures.push({ id: listing.id, symbol: listing.symbol, message: error.message });
    } finally {
      state.done += 1;
    }
  });

  coins.sort((a, b) => a.rank - b.rank);
  state.coins = coins;
  state.failures = failures;
  state.updatedAt = new Date().toISOString();
  state.phase = "ready";
  state.cooldownUntil = Date.now() + 90_000;
  writeCache();
}

export function refreshSnapshot({ force = false } = {}) {
  if (refreshPromise) return refreshPromise;
  if (!force && state.phase === "ready" && Date.now() < state.cooldownUntil) {
    return Promise.resolve(getState());
  }
  refreshPromise = refreshUncached()
    .catch((error) => {
      state.phase = state.coins.length ? "ready" : "error";
      state.error = error.message;
      throw error;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}
