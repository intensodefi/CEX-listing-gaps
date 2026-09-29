import assert from "node:assert/strict";
import test from "node:test";
import { refreshAllowed } from "./refresh.js";

test("refresh stays available outside Railway", () => {
  assert.equal(refreshAllowed({}), true);
});

test("Railway removes refresh unless it is explicitly turned back on", () => {
  assert.equal(refreshAllowed({ RAILWAY_ENVIRONMENT: "production" }), false);
  assert.equal(refreshAllowed({ RAILWAY_PROJECT_ID: "proj" }), false);
  assert.equal(refreshAllowed({ RAILWAY_ENVIRONMENT: "production", DISABLE_REFRESH: "0" }), true);
});

test("DISABLE_REFRESH turns refresh off anywhere", () => {
  assert.equal(refreshAllowed({ DISABLE_REFRESH: "1" }), false);
  assert.equal(refreshAllowed({ DISABLE_REFRESH: "true" }), false);
  assert.equal(refreshAllowed({ DISABLE_REFRESH: "yes" }), false);
});
