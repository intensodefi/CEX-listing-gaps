import { EXCHANGES } from "/shared/exchanges.js";
import { comparisonState, filterGaps, missingExchanges, overlapStats } from "/shared/compare.js";
import { platformLabel, tableToCsv } from "/shared/csv.js";
import { columnFiltersActive, matchesColumnFilters } from "/shared/filter.js";
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
const exportButton = document.querySelector("#export");
const TAG_LIMIT = 4;
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
  filters: { platform: [], tag: [], missing: [] },
  filterKey: "",
  filterQuery: "",
  described: [],
};

const FILTER_LABELS = { platform: "Platform", tag: "Tags", missing: "Also missing from" };
const filterPanel = document.querySelector("#filter-panel");
const filterTitle = document.querySelector("#filter-title");
const filterSearch = document.querySelector("#filter-search");
const filterHint = document.querySelector("#filter-hint");
const filterOptions = document.querySelector("#filter-options");

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
    clearColumnFilters();
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
  popover.classList.remove("is-tags");
  popover.replaceChildren();
}

function scheduleHidePopover() {
  window.clearTimeout(hidePopoverTimer);
  hidePopoverTimer = window.setTimeout(hidePopover, 160);
}

function placePopover(anchor) {
  popover.hidden = false;
  popover.style.maxHeight = "none";
  const rect = anchor.getBoundingClientRect();
  const width = popover.offsetWidth || 520;
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

function showPopover(anchor, exchanges) {
  window.clearTimeout(hidePopoverTimer);
  popover.classList.remove("is-tags");
  popover.replaceChildren();
  for (const exchange of exchanges) {
    const item = document.createElement("div");
    item.className = "ex-pop-item";
    const name = document.createElement("span");
    name.className = "ex-pop-name";
    name.textContent = exchange.label;
    item.append(exchangeLogo(exchange), name);
    popover.append(item);
  }
  placePopover(anchor);
}

function showTags(anchor, tags) {
  window.clearTimeout(hidePopoverTimer);
  popover.classList.add("is-tags");
  popover.replaceChildren();
  for (const tag of tags) {
    const chip = document.createElement("span");
    chip.className = "tag";
    chip.textContent = tag;
    popover.append(chip);
  }
  placePopover(anchor);
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

function profileFor(id) {
  return view.snapshot?.profiles?.[String(id)] || null;
}

function decorateEntry(entry) {
  if (!entry?.ok) return entry;
  return {
    ...entry,
    assets: (entry.assets || []).map((asset) => {
      const tags = profileFor(asset.id)?.tags || [];
      if (!tags.length) return asset;
      return { ...asset, tags, stable: asset.stable || tags.includes("stablecoin") };
    }),
  };
}

function comparedBooks() {
  const present = sides.present.value;
  const absent = sides.absent.value;
  const resolved = view.resolved || {};
  return {
    ...resolved,
    [present]: decorateEntry(resolved[present]),
    [absent]: decorateEntry(resolved[absent]),
  };
}

function clearColumnFilters() {
  view.filters = { platform: [], tag: [], missing: [] };
  closeFilter();
}

function describedGaps() {
  const present = sides.present.value;
  const absent = sides.absent.value;
  return visibleGaps().map((asset) => {
    const profile = profileFor(asset.id);
    const exchanges = missingExchanges(asset.id, view.resolved, OPTIONS, EXCHANGES, absent, present);
    return {
      asset,
      platform: profile ? platformLabel(profile) : "",
      tags: profile?.tags || [],
      missing: exchanges.map((exchange) => exchange.label),
      exchanges,
    };
  });
}

function displayedRows() {
  view.described = describedGaps();
  return view.described.filter((row) => matchesColumnFilters(row, view.filters));
}

function filterChoices(key) {
  const narrowed = view.described.filter((row) => matchesColumnFilters(row, { ...view.filters, [key]: [] }));
  const counts = new Map();
  for (const row of narrowed) {
    const values = key === "platform" ? [row.platform] : row[key === "tag" ? "tags" : "missing"];
    for (const value of values) {
      if (!value) continue;
      counts.set(value, (counts.get(value) || 0) + 1);
    }
  }
  for (const value of view.filters[key] || []) {
    if (!counts.has(value)) counts.set(value, 0);
  }
  const query = view.filterQuery.trim().toLowerCase();
  return [...counts.entries()]
    .filter(([value]) => !query || value.toLowerCase().includes(query))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function paintFilterOptions() {
  const key = view.filterKey;
  if (!key) return;
  filterOptions.replaceChildren();
  const choices = filterChoices(key);
  if (!choices.length) {
    const empty = document.createElement("p");
    empty.className = "filter-empty";
    empty.textContent = "No values match";
    filterOptions.append(empty);
    return;
  }
  const picked = new Set(view.filters[key]);
  const exclude = key === "tag";
  for (const [value, count] of choices) {
    const label = document.createElement("label");
    label.className = "filter-option";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = exclude ? !picked.has(value) : picked.has(value);
    input.addEventListener("change", () => {
      const current = view.filters[key];
      const without = current.filter((item) => item !== value);
      const include = input.checked !== exclude;
      view.filters[key] = include ? [...without, value] : without;
      render();
    });
    const name = document.createElement("span");
    name.textContent = value;
    const tally = document.createElement("span");
    tally.textContent = formatCount(count);
    label.append(input, name, tally);
    filterOptions.append(label);
  }
}

function placeFilter(anchor) {
  filterPanel.hidden = false;
  filterPanel.style.maxHeight = "none";
  const rect = anchor.getBoundingClientRect();
  const width = filterPanel.offsetWidth || 320;
  const margin = 8;
  let left = rect.left;
  if (left + width > window.innerWidth - margin) left = window.innerWidth - width - margin;
  filterPanel.style.left = `${Math.max(margin, left)}px`;
  filterPanel.style.top = `${rect.bottom + 6}px`;
  const needed = filterPanel.offsetHeight;
  if (rect.bottom + 6 + needed > window.innerHeight - margin) {
    filterPanel.style.top = `${Math.max(margin, rect.top - needed - 6)}px`;
  }
}

function openFilter(key, anchor) {
  view.filterKey = key;
  view.filterQuery = "";
  filterSearch.value = "";
  filterTitle.textContent = FILTER_LABELS[key];
  filterHint.hidden = key !== "tag";
  paintFilterOptions();
  placeFilter(anchor);
  filterSearch.focus();
}

function closeFilter() {
  view.filterKey = "";
  view.filterQuery = "";
  filterPanel.hidden = true;
  filterOptions.replaceChildren();
}

function syncFilterButtons() {
  const profilesReady = view.snapshot?.profilesReady === true;
  for (const button of document.querySelectorAll(".col-filter")) {
    const key = button.dataset.filter;
    const count = (view.filters[key] || []).length;
    button.classList.toggle("on", count > 0);
    const badge = button.querySelector(".filter-count");
    badge.hidden = count === 0;
    badge.textContent = String(count);
    button.disabled = key !== "missing" && !profilesReady;
  }
}

function visibleGaps() {
  const present = sides.present.value;
  const absent = sides.absent.value;
  const books = comparedBooks();
  if (!comparisonState(books, present, absent).ok) return [];
  const gaps = filterGaps(books, {
    present,
    absent,
    query: queryInput.value,
    includeStable: stableInput.checked,
  });
  return [...gaps].sort((a, b) => {
    const left = a[view.sort];
    const right = b[view.sort];
    if (typeof left === "string") return left.localeCompare(right) * view.direction;
    return ((left ?? 0) - (right ?? 0)) * view.direction;
  });
}

function renderPlatform(container, profile) {
  container.replaceChildren();
  const box = document.createElement("div");
  box.className = "platform";
  if (!view.snapshot?.profilesReady) {
    box.textContent = "…";
    container.append(box);
    return;
  }
  const name = document.createElement("b");
  name.textContent = profile ? platformLabel(profile) : "—";
  box.append(name);
  container.append(box);
}

function renderTags(container, tags) {
  container.replaceChildren();
  const box = document.createElement("div");
  box.className = "tags";
  if (!view.snapshot?.profilesReady) {
    box.textContent = "…";
    container.append(box);
    return;
  }
  if (!tags.length) {
    box.textContent = "—";
    container.append(box);
    return;
  }
  for (const tag of tags.slice(0, TAG_LIMIT)) {
    const chip = document.createElement("span");
    chip.className = "tag";
    chip.textContent = tag;
    box.append(chip);
  }
  const rest = tags.slice(TAG_LIMIT);
  if (rest.length) {
    const more = document.createElement("button");
    more.type = "button";
    more.className = "ex-more";
    more.textContent = `+${rest.length}`;
    more.setAttribute("aria-label", `${rest.length} more tags`);
    const open = () => showTags(more, tags);
    more.addEventListener("mouseenter", open);
    more.addEventListener("focus", open);
    more.addEventListener("mouseleave", scheduleHidePopover);
    more.addEventListener("blur", scheduleHidePopover);
    box.append(more);
  }
  container.append(box);
}

function exportName() {
  const raw = `${optionName(sides.present.value)}-vs-${optionName(sides.absent.value)}`;
  return `${raw.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-|-$/g, "")}.csv`;
}

function exportCsv() {
  const rows = displayedRows().map((row) => {
    const profile = profileFor(row.asset.id);
    return {
      symbol: row.asset.symbol,
      name: row.asset.name || "",
      id: row.asset.id,
      slug: row.asset.slug || "",
      pairs: row.asset.pairs || 0,
      quotes: row.asset.quotes || [],
      tags: row.tags,
      platform: row.platform,
      tokenAddress: profile?.tokenAddress || "",
      missing: row.missing,
    };
  });
  const blob = new Blob([`\uFEFF${tableToCsv(rows)}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = exportName();
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function render() {
  hidePopover();
  renderStatus();
  view.resolved = resolvedListings();
  syncComboText();
  const present = sides.present.value;
  const absent = sides.absent.value;
  const books = comparedBooks();
  const state = comparisonState(books, present, absent);
  const stats = state.ok ? overlapStats(books, present, absent, stableInput.checked) : null;

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
  const profilesReady = view.snapshot?.profilesReady === true;
  tableNote.textContent = !state.ok
    ? ""
    : profilesReady
      ? "Tags and platform come from CoinMarketCap. Export CSV uses this table."
      : `Loading tags and platforms${view.snapshot?.profileTotal ? ` (${formatCount(view.snapshot.profileDone)}/${formatCount(view.snapshot.profileTotal)})` : ""}.`;
  exportButton.disabled = !state.ok || !profilesReady;

  const shown = state.ok ? displayedRows() : [];
  const filtered = columnFiltersActive(view.filters);
  if (state.ok && profilesReady && filtered) {
    tableNote.textContent = `Showing ${formatCount(shown.length)} of ${formatCount(view.described.length)} assets.`;
  }
  syncFilterButtons();
  if (view.filterKey) paintFilterOptions();

  rowsEl.replaceChildren();
  emptyEl.hidden = shown.length > 0 || loading || !state.ok;
  emptyEl.textContent = filtered || queryInput.value ? "No assets match these filters." : "No assets match this comparison.";

  for (const row of shown) {
    const asset = row.asset;
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
      <td class="platform-cell"></td>
      <td class="tags-cell"></td>
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
    const profile = profileFor(asset.id);
    renderPlatform(tr.querySelector(".platform-cell"), profile);
    renderTags(tr.querySelector(".tags-cell"), row.tags);
    renderMissing(tr.querySelector(".missing"), row.exchanges);
    rowsEl.append(tr);
  }
}

async function pull() {
  const response = await fetch("/api/snapshot");
  view.snapshot = await response.json();
  render();
  const phase = view.snapshot?.phase;
  const waiting = !view.snapshot || phase === "loading" || phase === "idle" || view.snapshot.profilesReady === false;
  if (waiting) view.timer = window.setTimeout(pull, 700);
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
  if (!event.target.closest(".col-filter") && !event.target.closest(".filter-panel")) closeFilter();
});
window.addEventListener("scroll", () => {
  hidePopover();
}, true);
queryInput.addEventListener("input", render);
stableInput.addEventListener("change", render);
exportButton.addEventListener("click", exportCsv);
document.querySelector("#swap").addEventListener("click", () => {
  const next = sides.present.value;
  sides.present.value = sides.absent.value;
  sides.absent.value = next;
  clearColumnFilters();
  closeCombos();
  render();
});
document.querySelector("#refresh").addEventListener("click", async () => {
  statusLine.textContent = "Refreshing every pair";
  await fetch("/api/refresh?force=1", { method: "POST" });
  window.clearTimeout(view.timer);
  pull();
});
filterSearch.addEventListener("input", () => {
  view.filterQuery = filterSearch.value;
  paintFilterOptions();
});
filterSearch.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeFilter();
});
document.querySelector("#filter-clear").addEventListener("click", () => {
  if (!view.filterKey) return;
  view.filters[view.filterKey] = [];
  render();
});
for (const button of document.querySelectorAll(".col-filter")) {
  button.addEventListener("click", () => {
    if (button.disabled) return;
    if (view.filterKey === button.dataset.filter && !filterPanel.hidden) {
      closeFilter();
      return;
    }
    openFilter(button.dataset.filter, button);
  });
}
for (const button of document.querySelectorAll("th button[data-sort]")) {
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
