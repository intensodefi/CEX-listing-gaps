const STABLE_SYMBOLS = new Set([
  "USDT", "USDC", "DAI", "FDUSD", "TUSD", "USDE", "USDP", "PYUSD",
  "USD1", "USDS", "USDD", "GUSD", "FRAX", "LUSD", "CRVUSD", "EURC", "EURT",
]);

export function isStablecoin(asset) {
  if (!asset) return false;
  if (asset.stable === true) return true;
  if (Array.isArray(asset.tags) && asset.tags.includes("stablecoin")) return true;
  return STABLE_SYMBOLS.has(String(asset.symbol || "").toUpperCase());
}

export function markStable(asset) {
  return { ...asset, stable: isStablecoin(asset) };
}

function assetList(entry) {
  return entry?.ok ? entry.assets || [] : [];
}

export function comparisonState(book, present, absent) {
  if (!present || !absent || present === absent) {
    return { ok: false, message: "Choose two different listings." };
  }
  const left = book?.[present];
  const right = book?.[absent];
  if (!left?.ok) return { ok: false, message: left?.error || "The first exchange has no pair data yet." };
  if (!right?.ok) return { ok: false, message: right?.error || "The second exchange has no pair data yet." };
  return { ok: true, message: "" };
}

export function filterGaps(book, { present, absent, query = "", includeStable = false }) {
  if (!comparisonState(book, present, absent).ok) return [];
  const absentIds = new Set(assetList(book[absent]).map((asset) => asset.id));
  const needle = query.trim().toLowerCase();
  return assetList(book[present])
    .filter((asset) => {
      if (!includeStable && isStablecoin(asset)) return false;
      if (absentIds.has(asset.id)) return false;
      if (!needle) return true;
      return (
        asset.symbol.toLowerCase().includes(needle) ||
        (asset.name || "").toLowerCase().includes(needle)
      );
    })
    .sort((a, b) => (b.pairs || 0) - (a.pairs || 0) || a.symbol.localeCompare(b.symbol));
}

export function overlapStats(book, present, absent, includeStable = false) {
  const empty = { considered: 0, onPresent: 0, onAbsent: 0, onBoth: 0, gap: 0, reverseGap: 0, coverage: null, presentPairs: 0, absentPairs: 0 };
  if (!comparisonState(book, present, absent).ok) return empty;
  const presentAssets = assetList(book[present]).filter((asset) => includeStable || !isStablecoin(asset));
  const absentAssets = assetList(book[absent]).filter((asset) => includeStable || !isStablecoin(asset));
  const absentIds = new Set(absentAssets.map((asset) => asset.id));
  const presentIds = new Set(presentAssets.map((asset) => asset.id));
  const onBoth = presentAssets.filter((asset) => absentIds.has(asset.id)).length;
  return {
    considered: null,
    onPresent: presentAssets.length,
    onAbsent: absentAssets.length,
    onBoth,
    gap: presentAssets.length - onBoth,
    reverseGap: absentAssets.filter((asset) => !presentIds.has(asset.id)).length,
    coverage: presentAssets.length ? onBoth / presentAssets.length : null,
    presentPairs: book[present].pairCount || 0,
    absentPairs: book[absent].pairCount || 0,
  };
}

function optionKey(option) {
  return option.id || option.slug;
}

export function buildMatrix(book, options, includeStable = false) {
  const idsByKey = new Map();
  const listedByKey = new Map();
  for (const option of options) {
    const key = optionKey(option);
    const listed = assetList(book?.[key]).filter((asset) => includeStable || !isStablecoin(asset));
    listedByKey.set(key, listed);
    idsByKey.set(key, new Set(listed.map((asset) => asset.id)));
  }
  let maxGap = 0;
  const rows = options.map((option) => {
    const key = optionKey(option);
    const entry = book?.[key];
    const listed = listedByKey.get(key) || [];
    const cells = options.map((other) => {
      const otherKey = optionKey(other);
      if (!entry?.ok || !book?.[otherKey]?.ok) {
        return { slug: otherKey, kind: "missing", count: null };
      }
      if (otherKey === key) {
        return { slug: otherKey, kind: "self", count: listed.length };
      }
      const otherIds = idsByKey.get(otherKey);
      let count = 0;
      for (const asset of listed) {
        if (!otherIds.has(asset.id)) count += 1;
      }
      if (count > maxGap) maxGap = count;
      return { slug: otherKey, kind: "gap", count };
    });
    return {
      slug: key,
      name: option.name,
      short: option.short,
      ok: Boolean(entry?.ok),
      listed: entry?.ok ? listed.length : null,
      pairCount: entry?.pairCount || 0,
      cells,
    };
  });
  return { rows, maxGap };
}

function marketName(option) {
  const parts = String(option.name || "").split(" · ");
  return parts.length > 1 ? parts[parts.length - 1] : option.market;
}

export function missingExchanges(assetId, resolved, options, exchanges, absentId, presentId) {
  const present = options.find((option) => optionKey(option) === presentId);
  const seen = new Set();
  const rows = [];
  for (const option of options) {
    const id = optionKey(option);
    if (id === absentId || id === presentId) continue;
    const entry = resolved?.[id];
    if (!entry?.ok) continue;
    if (assetList(entry).some((asset) => asset.id === assetId)) continue;
    const sameMarketRegion = option.kind === "region" && option.market === present?.market;
    const siblingExchange = present?.kind === "exchange" && option.kind === "exchange" && option.slug === present.slug;
    const siblingRegion = present?.kind === "region" && option.kind === "region" && option.region === present.region;
    if (!sameMarketRegion && !siblingExchange && !siblingRegion) continue;
    const members = option.kind === "exchange"
      ? exchanges.filter((exchange) => exchange.slug === option.slug)
      : exchanges.filter((exchange) => exchange.region === option.region);
    const market = marketName(option);
    for (const exchange of members) {
      const key = `${exchange.slug}:${option.market}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        id: exchange.id,
        slug: exchange.slug,
        name: exchange.name,
        short: exchange.short,
        market: option.market,
        label: `${exchange.name} · ${market}`,
      });
    }
  }
  return rows;
}
