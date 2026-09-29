import fs from "node:fs";
import path from "node:path";
import { EXCHANGES, MARKETS } from "../shared/exchanges.js";
import { markStable } from "../shared/compare.js";

const PRO_BASE = "https://pro-api.coinmarketcap.com";
const SPOT_PAGE = "https://api.coinmarketcap.com/data-api/v3/exchange/market-pairs/latest";
const CACHE_VERSION = 2;

const state = {
  phase: "idle",
  done: 0,
  total: EXCHANGES.length * MARKETS.length,
  detail: "",
  error: null,
  updatedAt: null,
  books: emptyBooks(),
  failures: [],
  cooldownUntil: 0,
};

let refreshPromise = null;

function emptyBooks() {
  return { spot: {}, perpetual: {}, futures: {} };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cachePath() {
  return path.join(process.cwd(), "data", "snapshot.json");
}

function cacheTtl() {
  const parsed = Number(process.env.CACHE_TTL_MS || 30 * 60 * 1000);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30 * 60 * 1000;
}

export function getState() {
  return {
    phase: state.phase,
    done: state.done,
    total: state.total,
    detail: state.detail,
    error: state.error,
    updatedAt: state.updatedAt,
    failures: state.failures,
    exchanges: EXCHANGES,
    markets: MARKETS,
    books: state.books,
  };
}

async function readJson(url, { pro = false } = {}) {
  const headers = { Accept: "application/json", "User-Agent": "cmc-listing-dashboard" };
  if (pro) {
    if (!process.env.CMC_API_KEY) throw new Error("CMC_API_KEY is not set");
    headers["X-CMC_PRO_API_KEY"] = process.env.CMC_API_KEY;
  }
  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch(url, { headers });
    const body = await response.json().catch(() => ({}));
    const status = body.status || {};
    const code = status.error_code;
    const ok = response.ok && (code === 0 || code === "0" || code === undefined);
    if (ok && body.data) return body.data;
    const message = status.error_message || response.statusText || "request failed";
    lastError = new Error(`${message}`);
    const retryable = response.status === 429 || response.status >= 500 || String(code) === "500";
    if (!retryable || attempt === 4) throw lastError;
    await sleep(400 * attempt);
  }
  throw lastError;
}

function rememberAsset(assets, { id, symbol, name, slug, quote }) {
  if (!id || !symbol) return;
  const existing = assets.get(id) || {
    id,
    symbol,
    name: name || symbol,
    slug: slug || null,
    pairs: 0,
    quotes: [],
  };
  existing.pairs += 1;
  if (quote && !existing.quotes.includes(quote)) existing.quotes.push(quote);
  if (name && existing.name === existing.symbol) existing.name = name;
  if (slug && !existing.slug) existing.slug = slug;
  assets.set(id, existing);
}

async function fetchSpot(slug) {
  const assets = new Map();
  let start = 1;
  let total = Infinity;
  let seen = 0;
  while (start <= total && seen < 20000) {
    const url = new URL(SPOT_PAGE);
    url.searchParams.set("slug", slug);
    url.searchParams.set("category", "spot");
    url.searchParams.set("start", String(start));
    url.searchParams.set("limit", "1000");
    const data = await readJson(url);
    total = Number(data.numMarketPairs || 0);
    const pairs = data.marketPairs || [];
    if (!pairs.length) break;
    for (const pair of pairs) {
      if (pair.category && pair.category !== "spot") continue;
      rememberAsset(assets, {
        id: pair.baseCurrencyId,
        symbol: pair.baseSymbol,
        name: pair.baseCurrencyName,
        slug: pair.baseCurrencySlug,
        quote: pair.quoteSymbol,
      });
    }
    seen += pairs.length;
    start += pairs.length;
    if (pairs.length < 1000) break;
  }
  return { ok: true, pairCount: Number.isFinite(total) ? total : seen, assets: finishAssets(assets) };
}

async function fetchDerivatives(slug, category) {
  const assets = new Map();
  let start = 1;
  let total = Infinity;
  let seen = 0;
  while (start <= total && seen < 20000) {
    const url = new URL("/v5/exchange/derivatives/market-pairs/list/latest", PRO_BASE);
    url.searchParams.set("exchange_slug", slug);
    url.searchParams.set("category", category);
    url.searchParams.set("start", String(start));
    url.searchParams.set("limit", "1000");
    const data = await readJson(url, { pro: true });
    total = Number(data.num_market_pairs || 0);
    const pairs = data.market_pairs || [];
    for (const pair of pairs) {
      if (pair.category && pair.category !== category) continue;
      const base = pair.market_pair_base || {};
      if (base.currency_type && base.currency_type !== "cryptocurrency") continue;
      const quote = pair.market_pair_quote || {};
      rememberAsset(assets, {
        id: base.crypto_id,
        symbol: base.symbol || base.exchange_symbol,
        name: base.symbol || base.exchange_symbol,
        slug: null,
        quote: quote.symbol || quote.exchange_symbol,
      });
    }
    if (!pairs.length) break;
    seen += pairs.length;
    start += pairs.length;
    if (pairs.length < 1000) break;
  }
  return { ok: true, pairCount: Number.isFinite(total) ? total : seen, assets: finishAssets(assets) };
}

function finishAssets(assets) {
  return [...assets.values()]
    .map((asset) => markStable({ ...asset, quotes: asset.quotes.sort() }))
    .sort((a, b) => b.pairs - a.pairs || a.symbol.localeCompare(b.symbol));
}

async function loadNames() {
  const names = new Map();
  let start = 1;
  const limit = 5000;
  for (let page = 0; page < 8; page += 1) {
    const url = new URL("/v1/cryptocurrency/map", PRO_BASE);
    url.searchParams.set("listing_status", "active");
    url.searchParams.set("start", String(start));
    url.searchParams.set("limit", String(limit));
    const data = await readJson(url, { pro: true });
    if (!Array.isArray(data) || data.length === 0) break;
    for (const coin of data) {
      names.set(coin.id, { name: coin.name, slug: coin.slug, symbol: coin.symbol });
    }
    if (data.length < limit) break;
    start += data.length;
  }
  return names;
}

function applyNames(books, names) {
  for (const market of Object.keys(books)) {
    for (const entry of Object.values(books[market])) {
      if (!entry?.assets) continue;
      for (const asset of entry.assets) {
        const known = names.get(asset.id);
        if (!known) continue;
        asset.name = known.name || asset.name;
        asset.slug = known.slug || asset.slug;
        asset.symbol = known.symbol || asset.symbol;
      }
    }
  }
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
  const runners = Math.min(width, items.length);
  if (runners === 0) return;
  await Promise.all(Array.from({ length: runners }, () => run()));
}

function readCache() {
  try {
    const parsed = JSON.parse(fs.readFileSync(cachePath(), "utf8"));
    if (!parsed || parsed.version !== CACHE_VERSION || !parsed.books) return null;
    if (Date.now() - Date.parse(parsed.updatedAt) > cacheTtl()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache() {
  const file = cachePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({
    version: CACHE_VERSION,
    updatedAt: state.updatedAt,
    books: state.books,
    failures: state.failures,
  }));
}

export function loadFreshCache() {
  const cached = readCache();
  if (!cached) return false;
  state.phase = "ready";
  state.books = cached.books;
  state.failures = cached.failures || [];
  state.updatedAt = cached.updatedAt;
  state.done = state.total;
  state.detail = "";
  state.error = null;
  return true;
}

async function refreshUncached() {
  state.phase = "loading";
  state.error = null;
  state.done = 0;
  state.total = EXCHANGES.length * MARKETS.length;
  state.failures = [];
  state.books = emptyBooks();
  state.detail = "Loading asset names";

  const names = await loadNames().catch(() => new Map());
  const jobs = [];
  for (const exchange of EXCHANGES) {
    for (const market of MARKETS) jobs.push({ exchange, market: market.id });
  }

  await pool(jobs, 4, async (job) => {
    const label = `${job.exchange.name} ${job.market}`;
    state.detail = label;
    try {
      const result = job.market === "spot"
        ? await fetchSpot(job.exchange.slug)
        : await fetchDerivatives(job.exchange.slug, job.market);
      state.books[job.market][job.exchange.slug] = result;
    } catch (error) {
      state.books[job.market][job.exchange.slug] = {
        ok: false,
        pairCount: 0,
        assets: [],
        error: error.message,
      };
      state.failures.push({ slug: job.exchange.slug, market: job.market, message: error.message });
    } finally {
      state.done += 1;
    }
  });

  applyNames(state.books, names);
  state.updatedAt = new Date().toISOString();
  state.detail = "";
  state.phase = "ready";
  state.cooldownUntil = Date.now() + 180_000;
  writeCache();
  return getState();
}

export function refreshSnapshot({ force = false } = {}) {
  if (refreshPromise) return refreshPromise;
  if (!force && state.phase === "ready" && Date.now() < state.cooldownUntil) {
    return Promise.resolve(getState());
  }
  refreshPromise = refreshUncached()
    .catch((error) => {
      state.phase = state.updatedAt ? "ready" : "error";
      state.error = error.message;
      throw error;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}
