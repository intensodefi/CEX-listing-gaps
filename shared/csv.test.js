import assert from "node:assert/strict";
import test from "node:test";
import { platformLabel, tableToCsv } from "./csv.js";

test("platform label uses the chain name, or Native when there is no contract", () => {
  assert.equal(platformLabel(null), "");
  assert.equal(platformLabel({ platform: null }), "Native");
  assert.equal(platformLabel({ platform: "Ethereum" }), "Ethereum");
});

test("csv export quotes commas and joins tags, quotes, and missing exchanges", () => {
  const csv = tableToCsv([
    {
      symbol: "USDT",
      name: 'Tether, "USD"',
      id: 825,
      slug: "tether",
      pairs: 4,
      quotes: ["USD", "EUR"],
      tags: ["stablecoin", "asset-backed-stablecoin"],
      platform: "Ethereum",
      tokenAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7",
      missing: ["Coinbase · Spot", "Kraken · Spot"],
    },
  ]);
  const [header, row] = csv.trim().split("\n");
  assert.equal(header, "symbol,name,id,slug,pairs,quotes,tags,platform,token_address,also_missing_from");
  assert.equal(row, 'USDT,"Tether, ""USD""",825,tether,4,USD; EUR,stablecoin; asset-backed-stablecoin,Ethereum,0xdac17f958d2ee523a2206206994597c13d831ec7,Coinbase · Spot; Kraken · Spot');
});

test("csv export keeps a header when the table is empty", () => {
  assert.equal(tableToCsv([]), "symbol,name,id,slug,pairs,quotes,tags,platform,token_address,also_missing_from\n");
});
