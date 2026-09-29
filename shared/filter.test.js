import assert from "node:assert/strict";
import test from "node:test";
import { columnFiltersActive, matchesColumnFilters } from "./filter.js";

const row = {
  platform: "BNB",
  tags: ["ai-big-data", "layer-1"],
  missing: ["Coinbase · Perpetual", "Kraken · Perpetual"],
};

test("an empty column filter keeps every row", () => {
  assert.equal(columnFiltersActive({ platform: [], tag: [], missing: [] }), false);
  assert.equal(matchesColumnFilters(row, {}), true);
});

test("platform and missing filters narrow the row, and deselected tags hide it", () => {
  assert.equal(matchesColumnFilters(row, { platform: ["Ethereum"] }), false);
  assert.equal(matchesColumnFilters(row, { platform: ["BNB", "Ethereum"] }), true);
  assert.equal(matchesColumnFilters(row, { tag: ["tokenized-stock"] }), true);
  assert.equal(matchesColumnFilters(row, { tag: ["layer-1"] }), false);
  assert.equal(matchesColumnFilters(row, { tag: ["defi", "ai-big-data"] }), false);
  assert.equal(matchesColumnFilters({ ...row, tags: [] }, { tag: ["layer-1"] }), true);
  assert.equal(matchesColumnFilters(row, { missing: ["Bitstamp · Spot"] }), false);
  assert.equal(matchesColumnFilters(row, { missing: ["Kraken · Perpetual"] }), true);
});

test("column filters apply together", () => {
  const filters = { platform: ["BNB"], tag: ["tokenized-stock"], missing: ["Kraken · Perpetual"] };
  assert.equal(columnFiltersActive(filters), true);
  assert.equal(matchesColumnFilters(row, filters), true);
  assert.equal(matchesColumnFilters(row, { ...filters, tag: ["layer-1"] }), false);
  assert.equal(matchesColumnFilters(row, { ...filters, missing: ["Bitstamp · Spot"] }), false);
});
