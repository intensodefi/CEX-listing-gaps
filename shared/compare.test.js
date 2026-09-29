import assert from "node:assert/strict";
import test from "node:test";
import { EXCHANGES } from "./exchanges.js";
import { buildMatrix, filterGaps, isStablecoin, missingElsewhere, overlapStats } from "./compare.js";

const coins = [
  { id: 1, rank: 1, symbol: "BTC", name: "Bitcoin", stable: false, exchanges: ["binance", "coinbase-exchange", "kraken"] },
  { id: 2, rank: 2, symbol: "ETH", name: "Ethereum", stable: false, exchanges: ["binance", "coinbase-exchange"] },
  { id: 3, rank: 3, symbol: "USDT", name: "Tether", stable: true, exchanges: ["binance"] },
  { id: 4, rank: 81, symbol: "FLR", name: "Flare", stable: false, exchanges: ["coinbase-exchange", "kraken"] },
  { id: 5, rank: 90, symbol: "PYTH", name: "Pyth Network", stable: false, exchanges: ["binance", "kraken"] },
];

test("stablecoin tag detection", () => {
  assert.equal(isStablecoin(["mineable", "stablecoin"]), true);
  assert.equal(isStablecoin(["layer-1"]), false);
  assert.equal(isStablecoin(null), false);
});

test("gaps are listed on the first exchange and absent from the second", () => {
  const gaps = filterGaps(coins, { present: "binance", absent: "coinbase-exchange" });
  assert.deepEqual(gaps.map((coin) => coin.symbol), ["PYTH"]);
});

test("stablecoins stay hidden unless requested", () => {
  const hidden = filterGaps(coins, { present: "binance", absent: "kraken" });
  assert.deepEqual(hidden.map((coin) => coin.symbol), ["ETH"]);
  const shown = filterGaps(coins, { present: "binance", absent: "kraken", includeStable: true });
  assert.deepEqual(shown.map((coin) => coin.symbol), ["ETH", "USDT"]);
});

test("search matches symbol or name", () => {
  const bySymbol = filterGaps(coins, { present: "binance", absent: "coinbase-exchange", query: "py" });
  assert.deepEqual(bySymbol.map((coin) => coin.symbol), ["PYTH"]);
  const byName = filterGaps(coins, { present: "coinbase-exchange", absent: "binance", query: "flare" });
  assert.deepEqual(byName.map((coin) => coin.symbol), ["FLR"]);
});

test("overlap stats count both directions", () => {
  const stats = overlapStats(coins, "binance", "coinbase-exchange");
  assert.equal(stats.considered, 4);
  assert.equal(stats.onPresent, 3);
  assert.equal(stats.onBoth, 2);
  assert.equal(stats.gap, 1);
  assert.equal(stats.reverseGap, 1);
  assert.equal(stats.coverage, 2 / 3);
});

test("matrix diagonal is coverage and off-diagonal is the gap", () => {
  const exchanges = EXCHANGES.filter((exchange) =>
    ["binance", "coinbase-exchange", "kraken"].includes(exchange.slug),
  );
  const matrix = buildMatrix(coins, exchanges);
  const binance = matrix.rows.find((row) => row.slug === "binance");
  const self = binance.cells.find((cell) => cell.slug === "binance");
  const coinbase = binance.cells.find((cell) => cell.slug === "coinbase-exchange");
  assert.equal(self.kind, "self");
  assert.equal(self.count, 3);
  assert.equal(coinbase.count, 1);
  assert.equal(matrix.maxGap >= 1, true);
});

test("missing elsewhere skips the selected exchange", () => {
  const flare = coins.find((coin) => coin.symbol === "FLR");
  const missing = missingElsewhere(flare, EXCHANGES, "binance");
  assert.equal(missing.includes("BN"), false);
  assert.equal(missing.includes("CB"), false);
  assert.equal(missing.includes("OK"), true);
});
