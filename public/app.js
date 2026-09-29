import { EXCHANGES } from "/shared/exchanges.js";
import { comparisonState, filterGaps, missingExchanges, overlapStats } from "/shared/compare.js";
import { listingOptions, resolveListings } from "/shared/venues.js";

const OPTIONS = listingOptions();
const PRESENT_DEFAULT = "ex:binance:perpetual";
const ABSENT_DEFAULT = "ex:binance:spot";
const LOGO_LIMIT = 3;

const presentInput = document.querySelector("#present");
const absentInput = document.querySelector("#absent");
const queryInput = document.querySelector("#query");
const stableInput = document.querySelector("#include-stable");
const statusLine = document.querySelector("#status-line");
const lede = document.querySelector("#lede");
const statsEl = document.querySelector("#stats");
const rowsEl = document.querySelector("#rows");
const emptyEl = document.querySelector("#empty");
const tableTitle = document.querySelector("#table-title");
const tableNote = document.querySelector("#table-note");
const popover = document.createElement("div");
popover.className = "ex-pop";
popover.hidden = true;
document.body.append(popover);

const inputs = { present: presentInput, absent: absentInput };
const lists = {
  present: document.querySelector("#present-list"),
  absent: document.querySelector("#absent-list"),
};
const sides = {
  present: { value: PRESENT_DEFAULT, open: false, active: 0, query: "", dirty: false },
  absent: { value: ABSENT_DEFAULT, open: false, active: 0, query: "", dirty: false },
};

const view = {
  snapshot: null,
  resolved: {},
  sort: "pairs",
  direction: -1,
  timer: null,
};

let hidePopoverTimer = 0;

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

function listingLabel(id) {
  const option = optionById(id);
  if (!option) return "";
  const entry = view.resolved?.[id];
  const pairs = entry?.ok ? ` · ${formatCount(entry.pairCount)} pairs` : "";
  return `${option.name}${pairs}`;
}

function otherSide(side) {
  return side === "present" ? "absent" : "present";
}

function visibleOptions(side) {
  const query = sides[side].query.trim().toLowerCase();
  if (!query) return OPTIONS;
  return OPTIONS.filter((option) => `${option.name} ${option.group} ${option.short}`.toLowerCase().includes(query));
}

function closeSide(side, restore = true) {
  sides[side].open = false;
  sides[side].query = "";
  const input = inputs[side];
  const list = lists[side];
  input.setAttribute("aria-expanded", "false");
  input.removeAttribute("aria-activedescendant");
  input.closest(".combo").classList.remove("open");
  list.hidden = true;
  list.replaceChildren();
  sides[side].dirty = false;
  if (restore && document.activeElement !== input) input.value = listingLabel(sides[side].value);
}

function closeCombos() {
  closeSide("present");
  closeSide("absent");
}

function paintList(side) {
  const list = lists[side];
  const options = visibleOptions(side);
  list.replaceChildren();
  if (!options.length) {
    const empty = document.createElement("div");
    empty.className = "combo-empty";
    empty.textContent = "No listings match";
    list.append(empty);
    inputs[side].removeAttribute("aria-activedescendant");
    return;
  }
  if (sides[side].active >= options.length) sides[side].active = 0;
  let groupName = "";
  options.forEach((option, index) => {
    if (option.group !== groupName) {
      const group = document.createElement("div");
      group.className = "combo-group";
      group.textContent = option.group;
      list.append(group);
      groupName = option.group;
    }
    const choice = document.createElement("div");
    choice.className = "combo-option";
    choice.id = `${side}-opt-${index}`;
    choice.setAttribute("role", "option");
    choice.dataset.id = option.id;
    choice.setAttribute("aria-selected", option.id === sides[side].value ? "true" : "false");
    if (index === sides[side].active) choice.classList.add("is-active");
    const entry = view.resolved?.[option.id];
    const pairs = entry?.ok ? ` · ${formatCount(entry.pairCount)} pairs` : "";
    choice.textContent = `${option.name}${pairs}`;
    choice.addEventListener("mousedown", (event) => event.preventDefault());
    choice.addEventListener("click", () => choose(side, option.id));
    list.append(choice);
  });
  const active = list.querySelector(".is-active");
  inputs[side].setAttribute("aria-activedescendant", active ? active.id : "");
  active?.scrollIntoView({ block: "nearest" });
}

function openSide(side, { resetQuery = true } = {}) {
  const other = otherSide(side);
  if (sides[other].open) closeSide(other);
  sides[side].open = true;
  if (resetQuery) {
    sides[side].query = "";
    sides[side].dirty = false;
  }
  const selected = visibleOptions(side).findIndex((option) => option.id === sides[side].value);
  sides[side].active = selected >= 0 ? selected : 0;
  const input = inputs[side];
  input.setAttribute("aria-expanded", "true");
  input.closest(".combo").classList.add("open");
  lists[side].hidden = false;
  paintList(side);
}

function choose(side, id) {
  const previous = sides[side].value;
  const other = otherSide(side);
  if (id !== previous) {
    sides[side].value = id;
    if (sides[other].value === id) sides[other].value = previous;
  }
  closeSide(side, false);
  inputs[side].blur();
  render();
}

function moveActive(side, delta) {
  const count = visibleOptions(side).length;
  if (!count) return;
  sides[side].active = (sides[side].active + delta + count) % count;
  paintList(side);
}

function onComboKeydown(side, event) {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    if (!sides[side].open) openSide(side);
    else moveActive(side, 1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    if (!sides[side].open) openSide(side);
    else moveActive(side, -1);
  } else if (event.key === "Enter") {
    if (!sides[side].open) return;
    event.preventDefault();
    const option = visibleOptions(side)[sides[side].active];
    if (option) choose(side, option.id);
  } else if (event.key === "Escape") {
    if (!sides[side].open) return;
    event.preventDefault();
    closeSide(side, false);
    inputs[side].value = listingLabel(sides[side].value);
  } else if (event.key === "Home" && sides[side].open) {
    event.preventDefault();
    sides[side].active = 0;
    paintList(side);
  } else if (event.key === "End" && sides[side].open) {
    event.preventDefault();
    const count = visibleOptions(side).length;
    sides[side].active = Math.max(0, count - 1);
    paintList(side);
  }
}

function syncComboText() {
  for (const side of ["present", "absent"]) {
    if (document.activeElement === inputs[side]) continue;
    inputs[side].value = listingLabel(sides[side].value);
    if (sides[side].open) paintList(side);
  }
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

function exchangeLogo(exchange) {
  const mark = document.createElement("span");
  mark.className = "ex-logo";
  mark.title = exchange.label;
  const img = document.createElement("img");
  img.alt = exchange.label;
  img.width = 26;
  img.height = 26;
  if (exchange.id) img.src = `https://s2.coinmarketcap.com/static/img/exchanges/64x64/${exchange.id}.png`;
  img.addEventListener("error", () => {
    img.remove();
    mark.textContent = exchange.short || exchange.name.slice(0, 2);
  });
  if (exchange.id) mark.append(img);
  else mark.textContent = exchange.short || exchange.name.slice(0, 2);
  return mark;
}

function hidePopover() {
  window.clearTimeout(hidePopoverTimer);
  popover.hidden = true;
  popover.replaceChildren();
}

function scheduleHidePopover() {
  window.clearTimeout(hidePopoverTimer);
  hidePopoverTimer = window.setTimeout(hidePopover, 160);
}

function showPopover(anchor, exchanges) {
  window.clearTimeout(hidePopoverTimer);
  popover.replaceChildren();
  for (const exchange of exchanges) {
    const item = document.createElement("div");
    item.className = "ex-pop-item";
    item.append(exchangeLogo(exchange), document.createTextNode(exchange.label));
    popover.append(item);
  }
  popover.hidden = false;
  popover.style.maxHeight = "none";
  const rect = anchor.getBoundingClientRect();
  const width = 280;
  const margin = 8;
  let left = rect.left;
  if (left + width > window.innerWidth - margin) left = window.innerWidth - width - margin;
  popover.style.left = `${Math.max(margin, left)}px`;
  popover.style.top = `${rect.bottom + 6}px`;
  const spaceBelow = window.innerHeight - rect.bottom - 12;
  const spaceAbove = rect.top - 12;
  const needed = popover.scrollHeight;
  if (needed <= spaceBelow) return;
  if (needed <= spaceAbove) {
    popover.style.top = `${rect.top - needed - 6}px`;
    return;
  }
  const below = spaceBelow >= spaceAbove;
  popover.style.maxHeight = `${Math.max(140, below ? spaceBelow : spaceAbove)}px`;
  if (!below) popover.style.top = `${margin}px`;
}

function renderMissing(container, exchanges) {
  container.replaceChildren();
  if (!exchanges.length) {
    container.textContent = "—";
    return;
  }
  const shown = exchanges.slice(0, LOGO_LIMIT);
  const rest = exchanges.slice(LOGO_LIMIT);
  const row = document.createElement("div");
  row.className = "ex-logos";
  for (const exchange of shown) row.append(exchangeLogo(exchange));
  if (rest.length) {
    const more = document.createElement("button");
    more.type = "button";
    more.className = "ex-more";
    more.textContent = `+${rest.length}`;
    more.setAttribute("aria-label", `${rest.length} more exchanges`);
    const open = () => showPopover(more, rest);
    more.addEventListener("mouseenter", open);
    more.addEventListener("focus", open);
    more.addEventListener("mouseleave", scheduleHidePopover);
    more.addEventListener("blur", scheduleHidePopover);
    row.append(more);
  }
  container.append(row);
}

function render() {
  hidePopover();
  renderStatus();
  view.resolved = resolvedListings();
  syncComboText();
  const present = sides.present.value;
  const absent = sides.absent.value;
  const state = comparisonState(view.resolved, present, absent);
  const stats = state.ok ? overlapStats(view.resolved, present, absent, stableInput.checked) : null;

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
    ? filterGaps(view.resolved, {
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
      <td class="missing"></td>
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
    renderMissing(
      tr.querySelector(".missing"),
      missingExchanges(asset.id, view.resolved, OPTIONS, EXCHANGES, absent, present),
    );
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

for (const side of ["present", "absent"]) {
  const input = inputs[side];
  input.addEventListener("focus", () => {
    openSide(side);
    window.requestAnimationFrame(() => input.select());
  });
  input.addEventListener("input", () => {
    if (!sides[side].dirty) {
      const label = listingLabel(sides[side].value);
      let raw = input.value;
      if (label && raw.startsWith(label)) raw = raw.slice(label.length).trim();
      else if (label && raw.endsWith(label) && raw !== label) raw = raw.slice(0, raw.length - label.length).trim();
      if (raw !== input.value) input.value = raw;
      sides[side].dirty = true;
    }
    sides[side].query = input.value;
    sides[side].active = 0;
    if (!sides[side].open) openSide(side, { resetQuery: false });
    else paintList(side);
  });
  input.addEventListener("keydown", (event) => onComboKeydown(side, event));
  input.addEventListener("blur", () => {
    window.setTimeout(() => {
      if (!input.closest(".combo").contains(document.activeElement)) closeSide(side);
    }, 0);
  });
  const toggle = input.parentElement.querySelector(".combo-toggle");
  toggle.addEventListener("mousedown", (event) => event.preventDefault());
  toggle.addEventListener("click", () => {
    if (sides[side].open) {
      closeSide(side, false);
      input.value = listingLabel(sides[side].value);
      return;
    }
    input.focus();
  });
}

popover.addEventListener("mouseenter", () => window.clearTimeout(hidePopoverTimer));
popover.addEventListener("mouseleave", scheduleHidePopover);
document.addEventListener("pointerdown", (event) => {
  if (!event.target.closest(".combo")) closeCombos();
  if (!event.target.closest(".ex-more") && !event.target.closest(".ex-pop")) hidePopover();
});
window.addEventListener("scroll", hidePopover, true);
queryInput.addEventListener("input", render);
stableInput.addEventListener("change", render);
document.querySelector("#swap").addEventListener("click", () => {
  const next = sides.present.value;
  sides.present.value = sides.absent.value;
  sides.absent.value = next;
  closeCombos();
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

presentInput.value = optionName(PRESENT_DEFAULT);
absentInput.value = optionName(ABSENT_DEFAULT);
pull();
