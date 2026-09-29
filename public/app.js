import { EXCHANGES, MARKETS, REGIONS, exchangesInRegion, regionName } from "/shared/exchanges.js";
import { buildMatrix, comparisonState, filterGaps, missingElsewhere, overlapStats } from "/shared/compare.js";

const presentSelect = document.querySelector("#present");
const absentSelect = document.querySelector("#absent");
const regionSelect = document.querySelector("#region");
const queryInput = document.querySelector("#query");
const stableInput = document.querySelector("#include-stable");
const statusLine = document.querySelector("#status-line");
const lede = document.querySelector("#lede");
const statsEl = document.querySelector("#stats");
const matrixEl = document.querySelector("#matrix");
const matrixNote = document.querySelector("#matrix-note");
const rowsEl = document.querySelector("#rows");
const emptyEl = document.querySelector("#empty");
const tableTitle = document.querySelector("#table-title");
const tableNote = document.querySelector("#table-note");
const marketsEl = document.querySelector("#markets");

const view = {
  snapshot: null,
  market: "spot",
  region: "all",
  sort: "pairs",
  direction: -1,
  timer: null,
};

for (const market of MARKETS) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = market.name;
  button.dataset.market = market.id;
  button.className = market.id === view.market ? "on" : "";
  button.addEventListener("click", () => {
    view.market = market.id;
    for (const item of marketsEl.querySelectorAll("button")) {
      item.classList.toggle("on", item.dataset.market === view.market);
    }
    render();
  });
  marketsEl.append(button);
}

for (const region of REGIONS) {
  const option = document.createElement("option");
  option.value = region.id;
  option.textContent = region.name;
  regionSelect.append(option);
}

function marketName(id) {
  return MARKETS.find((market) => market.id === id)?.name || id;
}

function exchangeName(slug) {
  return EXCHANGES.find((exchange) => exchange.slug === slug)?.name || slug;
}

function book() {
  return view.snapshot?.books?.[view.market] || {};
}

function visibleExchanges() {
  return exchangesInRegion(EXCHANGES, view.region);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function formatCount(value) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US").format(value);
}

function fillExchangeSelects() {
  const exchanges = visibleExchanges();
  const currentBook = book();
  const previousPresent = presentSelect.value;
  const previousAbsent = absentSelect.value;
  for (const select of [presentSelect, absentSelect]) {
    select.replaceChildren();
    for (const exchange of exchanges) {
      const entry = currentBook[exchange.slug];
      const option = document.createElement("option");
      option.value = exchange.slug;
      const pairs = entry?.ok ? ` · ${formatCount(entry.pairCount)} pairs` : "";
      option.textContent = `${exchange.name}${pairs}`;
      select.append(option);
    }
  }
  const slugs = exchanges.map((exchange) => exchange.slug);
  const preferred = preferredPair(slugs);
  presentSelect.value = slugs.includes(previousPresent) ? previousPresent : preferred[0];
  const absentStillValid = slugs.includes(previousAbsent) && previousAbsent !== presentSelect.value;
  absentSelect.value = absentStillValid ? previousAbsent : preferred[1];
  if (!absentSelect.value || absentSelect.value === presentSelect.value) {
    absentSelect.value = slugs.find((slug) => slug !== presentSelect.value) || presentSelect.value;
  }
}

function preferredPair(slugs) {
  const pairs = [
    ["binance", "coinbase-exchange"],
    ["upbit", "bithumb"],
    ["bitflyer", "bitbank"],
    ["bitstamp", "bitvavo"],
  ];
  for (const [left, right] of pairs) {
    if (slugs.includes(left) && slugs.includes(right)) return [left, right];
  }
  return [slugs[0] || "", slugs[1] || slugs[0] || ""];
}

function gapColor(count, maxGap) {
  if (!count) return "#f7f3ea";
  const t = Math.min(1, count / Math.max(maxGap, 1));
  const red = Math.round(239 + (184 - 239) * t);
  const green = Math.round(230 + (67 - 230) * t);
  const blue = Math.round(214 + (31 - 214) * t);
  return `rgb(${red}, ${green}, ${blue})`;
}

function renderStatus() {
  const snapshot = view.snapshot;
  if (!snapshot) {
    statusLine.textContent = "Contacting the server";
    return;
  }
  if (snapshot.phase === "loading" || snapshot.phase === "idle") {
    const pct = snapshot.total ? Math.round((snapshot.done / snapshot.total) * 100) : 0;
    statusLine.textContent = snapshot.detail
      ? `Reading ${snapshot.detail} (${snapshot.done}/${snapshot.total})`
      : `Reading pairs ${snapshot.done}/${snapshot.total}`;
    lede.innerHTML = `Collecting every spot, perpetual, and futures pair. <span class="progress"><span style="width:${pct}%"></span></span>`;
    return;
  }
  if (snapshot.phase === "error") {
    statusLine.textContent = snapshot.error || "Market data could not be loaded";
    return;
  }
  const when = snapshot.updatedAt ? new Date(snapshot.updatedAt).toLocaleString() : "just now";
  const skipped = snapshot.failures?.length ? ` · ${snapshot.failures.length} feeds failed` : "";
  statusLine.textContent = `Updated ${when}${skipped}`;
  lede.textContent = `${marketName(view.market)} pairs only. ${regionName(view.region)} exchanges. Listing means the asset is the base of at least one pair.`;
}

function render() {
  renderStatus();
  fillExchangeSelects();
  const currentBook = book();
  const exchanges = visibleExchanges();
  const present = presentSelect.value;
  const absent = absentSelect.value;
  const state = comparisonState(currentBook, present, absent);
  const stats = state.ok ? overlapStats(currentBook, present, absent, stableInput.checked) : null;

  statsEl.replaceChildren();
  const cards = stats
    ? [
        [formatCount(stats.gap), `On ${exchangeName(present)}, not on ${exchangeName(absent)}`],
        [formatCount(stats.reverseGap), `On ${exchangeName(absent)}, not on ${exchangeName(present)}`],
        [formatCount(stats.presentPairs), `${marketName(view.market)} pairs on ${exchangeName(present)}`],
        [formatCount(stats.onPresent), `Assets on ${exchangeName(present)}`],
      ]
    : [["—", state.message || "Waiting for pair data"]];
  for (const [value, label] of cards) {
    const card = document.createElement("article");
    card.className = "stat";
    const strong = document.createElement("b");
    const span = document.createElement("span");
    strong.textContent = value;
    span.textContent = label;
    card.append(strong, span);
    statsEl.append(card);
  }

  const matrix = buildMatrix(currentBook, exchanges, stableInput.checked);
  matrixEl.replaceChildren();
  const columns = `118px repeat(${exchanges.length}, minmax(48px, 1fr))`;
  const head = document.createElement("div");
  head.className = "matrix-head";
  head.style.gridTemplateColumns = columns;
  head.append(document.createElement("span"));
  for (const exchange of exchanges) {
    const label = document.createElement("span");
    label.textContent = exchange.short;
    label.title = exchange.name;
    head.append(label);
  }
  matrixEl.append(head);
  matrixNote.textContent = `${marketName(view.market)} · ${regionName(view.region)}. Cell = assets with a pair on the row exchange and no pair on the column exchange.`;

  for (const row of matrix.rows) {
    const line = document.createElement("div");
    line.className = "matrix-row";
    line.style.gridTemplateColumns = columns;
    const label = document.createElement("div");
    label.className = "row-label";
    label.textContent = exchangeName(row.slug);
    label.title = row.ok ? `${formatCount(row.pairCount)} ${view.market} pairs` : "Pair feed unavailable";
    line.append(label);
    for (const cell of row.cells) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `cell ${cell.kind}`;
      button.textContent = cell.count === null ? "·" : String(cell.count);
      button.disabled = cell.kind !== "gap";
      if (cell.kind === "gap") {
        button.style.background = gapColor(cell.count, matrix.maxGap);
        button.title = `${cell.count} ${view.market} assets on ${exchangeName(row.slug)}, none on ${exchangeName(cell.slug)}`;
        button.addEventListener("click", () => {
          presentSelect.value = row.slug;
          absentSelect.value = cell.slug;
          render();
        });
      } else if (cell.kind === "self") {
        button.title = `${exchangeName(row.slug)} lists ${cell.count} ${view.market} assets`;
      }
      if (row.slug === present && cell.slug === absent) button.classList.add("selected");
      line.append(button);
    }
    matrixEl.append(line);
  }

  const loading = !view.snapshot || view.snapshot.phase === "loading" || view.snapshot.phase === "idle";
  tableTitle.textContent = loading
    ? "Collecting pairs"
    : state.ok
      ? `${marketName(view.market)} on ${exchangeName(present)}, not on ${exchangeName(absent)}`
      : state.message;
  tableNote.textContent = state.ok
    ? "Built from every pair in this market, not a top-100 sample."
    : "";

  let gaps = state.ok
    ? filterGaps(currentBook, {
        present,
        absent,
        query: queryInput.value,
        includeStable: stableInput.checked,
      })
    : [];
  gaps = [...gaps].sort((a, b) => {
    const left = a[view.sort];
    const right = b[view.sort];
    if (typeof left === "string") return left.localeCompare(right) * view.direction;
    return ((left ?? 0) - (right ?? 0)) * view.direction;
  });

  rowsEl.replaceChildren();
  emptyEl.hidden = gaps.length > 0 || loading || !state.ok;
  emptyEl.textContent = queryInput.value ? "No assets match this search." : "No assets match this comparison.";

  for (const asset of gaps) {
    const tr = document.createElement("tr");
    const quotes = asset.quotes || [];
    const shownQuotes = quotes.slice(0, 4);
    const extra = quotes.length - shownQuotes.length;
    tr.innerHTML = `
      <td>
        <div class="asset">
          <div class="mark"></div>
          <div>
            <a target="_blank" rel="noreferrer"></a>
            <small></small>
          </div>
        </div>
      </td>
      <td class="num">${escapeHtml(formatCount(asset.pairs))}</td>
      <td class="quotes"></td>
      <td><div class="pills"></div></td>
    `;
    const link = tr.querySelector("a");
    link.textContent = asset.symbol;
    if (asset.slug) link.href = `https://coinmarketcap.com/currencies/${encodeURIComponent(asset.slug)}/`;
    tr.querySelector("small").textContent = asset.name || "";
    const mark = tr.querySelector(".mark");
    const img = document.createElement("img");
    img.alt = "";
    img.src = `https://s2.coinmarketcap.com/static/img/coins/64x64/${asset.id}.png`;
    img.addEventListener("error", () => {
      mark.textContent = asset.symbol.slice(0, 3);
    });
    mark.append(img);
    tr.querySelector(".quotes").textContent = extra > 0
      ? `${shownQuotes.join(" · ")} +${extra}`
      : shownQuotes.join(" · ");
    const pills = tr.querySelector(".pills");
    const missing = missingElsewhere(asset.id, currentBook, exchanges, absent);
    if (missing.length === 0) {
      pills.textContent = "Listed on the other venues in this region";
    } else {
      for (const short of missing) {
        const pill = document.createElement("span");
        pill.className = "pill";
        pill.textContent = short;
        pills.append(pill);
      }
    }
    rowsEl.append(tr);
  }
}

async function pull() {
  const response = await fetch("/api/snapshot");
  view.snapshot = await response.json();
  render();
  if (!view.snapshot || view.snapshot.phase === "loading" || view.snapshot.phase === "idle") {
    view.timer = window.setTimeout(pull, 700);
  }
}

presentSelect.addEventListener("change", render);
absentSelect.addEventListener("change", render);
regionSelect.addEventListener("change", () => {
  view.region = regionSelect.value;
  render();
});
queryInput.addEventListener("input", render);
stableInput.addEventListener("change", render);
document.querySelector("#swap").addEventListener("click", () => {
  const next = presentSelect.value;
  presentSelect.value = absentSelect.value;
  absentSelect.value = next;
  render();
});
document.querySelector("#refresh").addEventListener("click", async () => {
  statusLine.textContent = "Refreshing every pair";
  await fetch("/api/refresh?force=1", { method: "POST" });
  window.clearTimeout(view.timer);
  pull();
});
for (const button of document.querySelectorAll("th button")) {
  button.addEventListener("click", () => {
    const sort = button.dataset.sort;
    view.direction = view.sort === sort ? view.direction * -1 : sort === "symbol" ? 1 : -1;
    view.sort = sort;
    render();
  });
}

pull();
