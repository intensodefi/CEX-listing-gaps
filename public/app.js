import { EXCHANGES } from "/shared/exchanges.js";
import { buildMatrix, comparisonState, filterGaps, missingElsewhere, overlapStats } from "/shared/compare.js";
import { listingOptions, resolveListings } from "/shared/venues.js";

const OPTIONS = listingOptions();
const PRESENT_DEFAULT = "ex:binance:perpetual";
const ABSENT_DEFAULT = "ex:binance:spot";

const presentSelect = document.querySelector("#present");
const absentSelect = document.querySelector("#absent");
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

const view = {
  snapshot: null,
  sort: "pairs",
  direction: -1,
  timer: null,
  matrixKey: "",
};

function optionById(id) {
  return OPTIONS.find((option) => option.id === id) || null;
}

function optionName(id) {
  return optionById(id)?.name || id;
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

function resolvedListings() {
  return resolveListings(view.snapshot?.books || {}, OPTIONS, EXCHANGES);
}

function fillSelect(select, resolved, selected, fallback) {
  const previous = select.value || selected;
  select.replaceChildren();
  let groupName = "";
  let group = null;
  for (const option of OPTIONS) {
    if (option.group !== groupName) {
      group = document.createElement("optgroup");
      group.label = option.group;
      select.append(group);
      groupName = option.group;
    }
    const entry = resolved[option.id];
    const choice = document.createElement("option");
    choice.value = option.id;
    const pairs = entry?.ok ? ` · ${formatCount(entry.pairCount)} pairs` : "";
    choice.textContent = `${option.name}${pairs}`;
    group.append(choice);
  }
  const ids = OPTIONS.map((option) => option.id);
  select.value = ids.includes(previous) ? previous : fallback;
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
  lede.textContent = "Each side can be an exchange market or a country group. Spot, perpetual, and dated futures stay separate.";
}

function renderMatrix(resolved, present, absent) {
  const key = `${view.snapshot?.updatedAt || ""}|${stableInput.checked}|${present}|${absent}`;
  if (key === view.matrixKey && matrixEl.childElementCount) return;
  view.matrixKey = key;
  const matrix = buildMatrix(resolved, OPTIONS, stableInput.checked);
  matrixEl.replaceChildren();
  const columns = `168px repeat(${OPTIONS.length}, minmax(52px, 1fr))`;
  const head = document.createElement("div");
  head.className = "matrix-head";
  head.style.gridTemplateColumns = columns;
  head.append(document.createElement("span"));
  for (const option of OPTIONS) {
    const label = document.createElement("span");
    label.textContent = option.short;
    label.title = option.name;
    head.append(label);
  }
  matrixEl.append(head);
  matrixNote.textContent = "Rows and columns use the same listings as the menus, including Binance spot next to Binance perpetual and each country group.";

  for (const row of matrix.rows) {
    const line = document.createElement("div");
    line.className = "matrix-row";
    line.style.gridTemplateColumns = columns;
    const label = document.createElement("div");
    label.className = "row-label";
    label.textContent = row.name;
    label.title = row.ok ? `${formatCount(row.pairCount)} pairs` : "Pair feed unavailable";
    line.append(label);
    for (const cell of row.cells) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `cell ${cell.kind}`;
      button.textContent = cell.count === null ? "·" : String(cell.count);
      button.disabled = cell.kind !== "gap";
      if (cell.kind === "gap") {
        button.style.background = gapColor(cell.count, matrix.maxGap);
        button.title = `${cell.count} on ${optionName(row.slug)}, none on ${optionName(cell.slug)}`;
        button.addEventListener("click", () => {
          presentSelect.value = row.slug;
          absentSelect.value = cell.slug;
          render();
        });
      } else if (cell.kind === "self") {
        button.title = `${optionName(row.slug)} lists ${cell.count} assets`;
      }
      if (row.slug === present && cell.slug === absent) button.classList.add("selected");
      line.append(button);
    }
    matrixEl.append(line);
  }
}

function render() {
  renderStatus();
  const resolved = resolvedListings();
  fillSelect(presentSelect, resolved, PRESENT_DEFAULT, PRESENT_DEFAULT);
  fillSelect(absentSelect, resolved, ABSENT_DEFAULT, ABSENT_DEFAULT);
  if (absentSelect.value === presentSelect.value) {
    absentSelect.value = OPTIONS.find((option) => option.id !== presentSelect.value)?.id || presentSelect.value;
  }
  const present = presentSelect.value;
  const absent = absentSelect.value;
  const state = comparisonState(resolved, present, absent);
  const stats = state.ok ? overlapStats(resolved, present, absent, stableInput.checked) : null;

  statsEl.replaceChildren();
  const cards = stats
    ? [
        [formatCount(stats.gap), `On ${optionName(present)}, not on ${optionName(absent)}`],
        [formatCount(stats.reverseGap), `On ${optionName(absent)}, not on ${optionName(present)}`],
        [formatCount(stats.presentPairs), `Pairs in ${optionName(present)}`],
        [formatCount(stats.onPresent), `Assets on ${optionName(present)}`],
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

  renderMatrix(resolved, present, absent);

  const loading = !view.snapshot || view.snapshot.phase === "loading" || view.snapshot.phase === "idle";
  tableTitle.textContent = loading
    ? "Collecting pairs"
    : state.ok
      ? `On ${optionName(present)}, not on ${optionName(absent)}`
      : state.message;
  tableNote.textContent = state.ok
    ? "Same exchange, different markets, and country groups are all valid sides."
    : "";

  let gaps = state.ok
    ? filterGaps(resolved, {
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
    const missing = missingElsewhere(asset.id, resolved, OPTIONS, absent, present);
    const shown = missing.slice(0, 8);
    if (shown.length === 0) {
      pills.textContent = "Listed on the other country groups and sibling markets";
    } else {
      for (const short of shown) {
        const pill = document.createElement("span");
        pill.className = "pill";
        pill.textContent = short;
        pills.append(pill);
      }
      if (missing.length > shown.length) {
        const more = document.createElement("span");
        more.className = "pill";
        more.textContent = `+${missing.length - shown.length}`;
        pills.append(more);
      }
    }
    rowsEl.append(tr);
  }
}

async function pull() {
  const response = await fetch("/api/snapshot");
  view.snapshot = await response.json();
  view.matrixKey = "";
  render();
  if (!view.snapshot || view.snapshot.phase === "loading" || view.snapshot.phase === "idle") {
    view.timer = window.setTimeout(pull, 700);
  }
}

presentSelect.addEventListener("change", render);
absentSelect.addEventListener("change", render);
queryInput.addEventListener("input", render);
stableInput.addEventListener("change", () => {
  view.matrixKey = "";
  render();
});
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
