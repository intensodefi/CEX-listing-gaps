import assert from "node:assert/strict";
import test from "node:test";
import { columnFiltersActive, matchesColumnFilters } from "./filter.js";

const row = {
  platform: "BNB",
  tags: ["ai-big-data", "layer-1"],
};

const all = { mode: "all", values: [] };
const none = { mode: "none", values: [] };
const pick = (values) => ({ mode: "pick", values });

test("selecting every value keeps every row", () => {
  assert.equal(columnFiltersActive({ platform: all, tag: all }), false);
  assert.equal(matchesColumnFilters(row, {}), true);
  assert.equal(matchesColumnFilters(row, { platform: all, tag: all }), true);
});

test("one selected value keeps only rows that match it", () => {
  assert.equal(columnFiltersActive({ platform: pick(["BNB"]) }), true);
  assert.equal(matchesColumnFilters(row, { platform: pick(["BNB"]) }), true);
  assert.equal(matchesColumnFilters(row, { platform: pick(["Ethereum"]) }), false);
  assert.equal(matchesColumnFilters(row, { platform: pick(["BNB", "Ethereum"]) }), true);
  assert.equal(matchesColumnFilters(row, { tag: pick(["layer-1"]) }), true);
  assert.equal(matchesColumnFilters(row, { tag: pick(["tokenized-stock"]) }), false);
  assert.equal(matchesColumnFilters(row, { tag: pick(["layer-1", "defi"]) }), true);
  assert.equal(matchesColumnFilters({ ...row, tags: [] }, { tag: pick(["layer-1"]) }), false);
  assert.equal(matchesColumnFilters(row, { platform: none }), false);
  assert.equal(columnFiltersActive({ tag: none }), true);
});

test("column filters apply together", () => {
  const filters = {
    platform: pick(["BNB"]),
    tag: pick(["ai-big-data"]),
  };
  assert.equal(columnFiltersActive(filters), true);
  assert.equal(matchesColumnFilters(row, filters), true);
  assert.equal(matchesColumnFilters(row, { ...filters, platform: pick(["Ethereum"]) }), false);
  assert.equal(matchesColumnFilters(row, { ...filters, tag: pick(["tokenized-stock"]) }), false);
  assert.equal(matchesColumnFilters(row, { ...filters, tag: none }), false);
});
