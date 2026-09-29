import assert from "node:assert/strict";
import test from "node:test";
import { filterGaps, isStablecoin, missingElsewhere, overlapStats, comparisonState, buildMatrix } from "./compare.js";
import { exchangesInRegion, EXCHANGES } from "./exchanges.js";

const spot = {
  binance: {
    ok: true,
    pairCount: 4,
    assets: [
      { id: 1, symbol: "BTC", name: "Bitcoin", stable: false, pairs: 2, quotes: ["USDT", "USD"] },
      { id: 2, symbol: "ETH", name: "Ethereum", stable: false, pairs: 1, quotes: ["USDT"] },
      { id: 825, symbol: "USDT", name: "Tether", stable: true, pairs: 1, quotes: ["USD"] },
    ],
  },
  "coinbase-exchange": {
    ok: true,
    pairCount: 1,
    assets: [
      { id: 1, symbol: "BTC", name: "Bitcoin", stable: false, pairs: 1, quotes: ["USD"] },
    ],
  },
  upbit: { ok: false, pairCount: 0, assets: [], error: "unavailable" },
};

const perpetual = {
  binance: {
    ok: true,
    pairCount: 1,
    assets: [{ id: 9, symbol: "SOL", name: "Solana", stable: false, pairs: 1, quotes: ["USDT"] }],
  },
  "coinbase-exchange": { ok: true, pairCount: 0, assets: [] },
};

test("stablecoin symbols are recognized", () => {
  assert.equal(isStablecoin({ symbol: "USDC" }), true);
  assert.equal(isStablecoin({ symbol: "BTC", stable: false }), false);
});

test("spot gaps use every base asset from pairs, not a rank sample", () => {
  const gaps = filterGaps(spot, { present: "binance", absent: "coinbase-exchange" });
  assert.deepEqual(gaps.map((asset) => asset.symbol), ["ETH"]);
});

test("perpetual listings do not leak into spot gaps", () => {
  const gaps = filterGaps(perpetual, { present: "binance", absent: "coinbase-exchange" });
  assert.deepEqual(gaps.map((asset) => asset.symbol), ["SOL"]);
  assert.deepEqual(filterGaps(spot, { present: "binance", absent: "coinbase-exchange" }).map((asset) => asset.symbol), ["ETH"]);
});

test("a failed exchange is not treated as an empty listing", () => {
  assert.equal(comparisonState(spot, "binance", "upbit").ok, false);
  assert.deepEqual(filterGaps(spot, { present: "binance", absent: "upbit" }), []);
});

test("stablecoins stay hidden unless requested", () => {
  const hidden = filterGaps(spot, { present: "binance", absent: "coinbase-exchange" });
  assert.equal(hidden.some((asset) => asset.symbol === "USDT"), false);
  const shown = filterGaps(spot, { present: "binance", absent: "coinbase-exchange", includeStable: true });
  assert.deepEqual(shown.map((asset) => asset.symbol), ["ETH", "USDT"]);
});

test("region filter keeps one home market per exchange", () => {
  assert.deepEqual(exchangesInRegion(EXCHANGES, "kr").map((exchange) => exchange.slug), [
    "upbit", "bithumb", "coinone", "korbit", "gopax",
  ]);
  assert.deepEqual(exchangesInRegion(EXCHANGES, "us").map((exchange) => exchange.slug), [
    "coinbase-exchange", "kraken", "gemini", "binance-us",
  ]);
  assert.equal(exchangesInRegion(EXCHANGES, "all").length, EXCHANGES.length);
});

test("overlap counts pairs separately from assets", () => {
  const stats = overlapStats(spot, "binance", "coinbase-exchange");
  assert.equal(stats.gap, 1);
  assert.equal(stats.onBoth, 1);
  assert.equal(stats.presentPairs, 4);
  assert.equal(stats.coverage, 1 / 2);
});

test("matrix skips exchanges whose pair fetch failed", () => {
  const exchanges = [
    { slug: "binance", name: "Binance", short: "BN" },
    { slug: "coinbase-exchange", name: "Coinbase", short: "CB" },
    { slug: "upbit", name: "Upbit", short: "UP" },
  ];
  const matrix = buildMatrix(spot, exchanges);
  const binance = matrix.rows.find((row) => row.slug === "binance");
  assert.equal(binance.cells.find((cell) => cell.slug === "coinbase-exchange").count, 1);
  assert.equal(binance.cells.find((cell) => cell.slug === "upbit").kind, "missing");
});

test("missing elsewhere ignores the selected venue and failed venues", () => {
  const exchanges = EXCHANGES.filter((exchange) => ["binance", "coinbase-exchange", "kraken"].includes(exchange.slug));
  const book = {
    ...spot,
    kraken: { ok: true, pairCount: 0, assets: [] },
  };
  const missing = missingElsewhere(2, book, exchanges, "coinbase-exchange");
  assert.deepEqual(missing, ["KR"]);
});
