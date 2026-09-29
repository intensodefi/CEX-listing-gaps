import { EXCHANGES } from "/shared/exchanges.js";
import { buildMatrix, filterGaps, missingElsewhere, overlapStats } from "/shared/compare.js";

const presentSelect = document.querySelector("#present");
const absentSelect = document.querySelector("#absent");
const queryInput = document.querySelector("#query");
const stableInput = document.querySelector("#include-stable");
const statusLine = document.querySelector("#status-line");
const lede = document.querySelector("#lede");
const statsEl = document.querySelector("#stats");
const matrixEl = document.querySelector("#matrix");
const rowsEl = document.querySelector("#rows");
const emptyEl = document.querySelector("#empty");
const tableTitle = document.querySelector("#table-title");
const tableNote = document.querySelector("#table-note");

const state = {
  snapshot: null,
  sort: "rank",
  direction: 1,
  timer: null,
};

for (const exchange of EXCHANGES) {
  for (const select of [presentSelect, absentSelect]) {
    const option = document.createElement("option");
    option.value = exchange.slug;
    option.textContent = exchange.name;
    select.append(option);
  }
}
presentSelect.value = "binance";
absentSelect.value = "coinbase-exchange";

function exchangeName(slug) {
  return EXCHANGES.find((exchange) => exchange.slug === slug)?.name || slug;
}

function formatUsd(value, digits) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
  }).format(value);
}

function formatPrice(value) {
  if (value === null || value === undefined) return "—";
  if (value >= 1000) return formatUsd(value, 0);
  if (value >= 1) return formatUsd(value, 2);
  if (value >= 0.01) return formatUsd(value, 4);
  return formatUsd(value, 6);
}

function formatCap(value) {
  if (value === null || value === undefined) return "—";
  const abs = Math.abs(value);
  if (abs >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  return formatUsd(value, 0);
}

function formatPct(value) {
  if (value === null || value === undefined) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
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
  const snapshot = state.snapshot;
  if (!snapshot) {
    statusLine.textContent = "Contacting the server";
    return;
  }
  if (snapshot.phase === "loading") {
    const pct = snapshot.total ? Math.round((snapshot.done / snapshot.total) * 100) : 0;
    statusLine.innerHTML = `Reading exchange maps ${snapshot.done}/${snapshot.total}`;
    lede.innerHTML = `Checking which major exchanges track each asset. <span class="progress"><span style="width:${pct}%"></span></span>`;
    return;
  }
  if (snapshot.phase === "error") {
    statusLine.textContent = snapshot.error || "Market data could not be loaded";
    return;
  }
  const when = snapshot.updatedAt ? new Date(snapshot.updatedAt).toLocaleString() : "just now";
  const skipped = snapshot.failures?.length ? ` · ${snapshot.failures.length} skipped` : "";
  statusLine.textContent = `Updated ${when}${skipped}`;
  lede.textContent = `Top ${snapshot.universeSize} assets by market cap. A gap means the asset is tracked on one exchange and not the other.`;
}

function render() {
  renderStatus();
  const snapshot = state.snapshot;
  const coins = snapshot?.coins || [];
  const includeStable = stableInput.checked;
  const present = presentSelect.value;
  const absent = absentSelect.value;
  const same = present === absent;

  const stats = same ? null : overlapStats(coins, present, absent, includeStable);
  statsEl.innerHTML = "";
  const cards = same
    ? [["—", "Choose two exchanges"]]
    : [
        [String(stats.gap), `On ${exchangeName(present)}, not on ${exchangeName(absent)}`],
        [String(stats.reverseGap), `On ${exchangeName(absent)}, not on ${exchangeName(present)}`],
        [stats.coverage === null ? "—" : `${Math.round(stats.coverage * 100)}%`, `${exchangeName(absent)} coverage of ${exchangeName(present)}`],
        [String(stats.considered), includeStable ? "Assets in view" : "Assets in view, stablecoins hidden"],
      ];
  for (const [value, label] of cards) {
    const card = document.createElement("article");
    card.className = "stat";
    card.innerHTML = `<b></b><span></span>`;
    card.querySelector("b").textContent = value;
    card.querySelector("span").textContent = label;
    statsEl.append(card);
  }

  const matrix = buildMatrix(coins, EXCHANGES, includeStable);
  matrixEl.replaceChildren();
  const head = document.createElement("div");
  head.className = "matrix-head";
  head.append(document.createElement("span"));
  for (const exchange of EXCHANGES) {
    const label = document.createElement("span");
    label.textContent = exchange.short;
    label.title = exchange.name;
    head.append(label);
  }
  matrixEl.append(head);

  for (const row of matrix.rows) {
    const line = document.createElement("div");
    line.className = "matrix-row";
    const label = document.createElement("div");
    label.className = "row-label";
    label.textContent = exchangeName(row.slug);
    line.append(label);
    for (const cell of row.cells) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `cell ${cell.kind}`;
      button.textContent = String(cell.count);
      button.title = cell.kind === "self"
        ? `${exchangeName(row.slug)} tracks ${cell.count} assets in this view`
        : `${cell.count} listed on ${exchangeName(row.slug)} but not ${exchangeName(cell.slug)}`;
      button.style.background = cell.kind === "gap" ? gapColor(cell.count, matrix.maxGap) : "";
      if (row.slug === present && cell.slug === absent) button.classList.add("selected");
      if (cell.kind === "gap") {
        button.addEventListener("click", () => {
          presentSelect.value = row.slug;
          absentSelect.value = cell.slug;
          render();
        });
      }
      line.append(button);
    }
    matrixEl.append(line);
  }

  tableTitle.textContent = same
    ? "Choose two different exchanges"
    : `On ${exchangeName(present)}, not on ${exchangeName(absent)}`;
  tableNote.textContent = same ? "" : "Sorted within the current top-asset universe.";

  let gaps = same ? [] : filterGaps(coins, {
    present,
    absent,
    query: queryInput.value,
    includeStable,
  });
  gaps = [...gaps].sort((a, b) => {
    const left = a[state.sort];
    const right = b[state.sort];
    if (typeof left === "string") return left.localeCompare(right) * state.direction;
    return ((left ?? 0) - (right ?? 0)) * state.direction;
  });

  rowsEl.replaceChildren();
  emptyEl.hidden = gaps.length > 0 || snapshot?.phase === "loading";
  for (const coin of gaps) {
    const tr = document.createElement("tr");
    const missing = missingElsewhere(coin, EXCHANGES, absent);
    const changeClass = coin.change24h > 0 ? "up" : coin.change24h < 0 ? "down" : "";
    tr.innerHTML = `
      <td class="num">${escapeHtml(coin.rank)}</td>
      <td>
        <div class="asset">
          <div class="mark"></div>
          <div>
            <a href="https://coinmarketcap.com/currencies/${encodeURIComponent(coin.slug)}/" target="_blank" rel="noreferrer">${escapeHtml(coin.symbol)}</a>
            <small></small>
          </div>
        </div>
      </td>
      <td class="num">${escapeHtml(formatPrice(coin.price))}</td>
      <td class="num">${escapeHtml(formatCap(coin.marketCap))}</td>
      <td class="num ${changeClass}">${escapeHtml(formatPct(coin.change24h))}</td>
      <td class="num">${escapeHtml(coin.markets ?? "—")}</td>
      <td><div class="pills"></div></td>
    `;
    const mark = tr.querySelector(".mark");
    const img = document.createElement("img");
    img.alt = "";
    img.src = `https://s2.coinmarketcap.com/static/img/coins/64x64/${coin.id}.png`;
    img.addEventListener("error", () => {
      mark.textContent = coin.symbol.slice(0, 3);
    });
    mark.append(img);
    tr.querySelector("small").textContent = coin.name;
    const pills = tr.querySelector(".pills");
    if (missing.length === 0) {
      pills.textContent = "Listed on the other majors";
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
  state.snapshot = await response.json();
  render();
  if (state.snapshot.phase === "loading" || state.snapshot.phase === "idle") {
    state.timer = window.setTimeout(pull, 500);
  }
}

presentSelect.addEventListener("change", render);
absentSelect.addEventListener("change", render);
queryInput.addEventListener("input", render);
stableInput.addEventListener("change", render);
document.querySelector("#swap").addEventListener("click", () => {
  const next = presentSelect.value;
  presentSelect.value = absentSelect.value;
  absentSelect.value = next;
  render();
});
document.querySelector("#refresh").addEventListener("click", async () => {
  statusLine.textContent = "Refreshing from CoinMarketCap";
  await fetch("/api/refresh?force=1", { method: "POST" });
  window.clearTimeout(state.timer);
  pull();
});
for (const button of document.querySelectorAll("th button")) {
  button.addEventListener("click", () => {
    const sort = button.dataset.sort;
    state.direction = state.sort === sort ? state.direction * -1 : 1;
    state.sort = sort;
    render();
  });
}

pull();
