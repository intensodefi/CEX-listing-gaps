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
    return { ok: false, message: "Choose two different exchanges." };
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

export function buildMatrix(book, exchanges, includeStable = false) {
  const idsBySlug = new Map();
  const listedBySlug = new Map();
  for (const exchange of exchanges) {
    const listed = assetList(book?.[exchange.slug]).filter((asset) => includeStable || !isStablecoin(asset));
    listedBySlug.set(exchange.slug, listed);
    idsBySlug.set(exchange.slug, new Set(listed.map((asset) => asset.id)));
  }
  let maxGap = 0;
  const rows = exchanges.map((exchange) => {
    const entry = book?.[exchange.slug];
    const listed = listedBySlug.get(exchange.slug) || [];
    const cells = exchanges.map((other) => {
      if (!entry?.ok || !book?.[other.slug]?.ok) {
        return { slug: other.slug, kind: "missing", count: null };
      }
      if (other.slug === exchange.slug) {
        return { slug: other.slug, kind: "self", count: listed.length };
      }
      const otherIds = idsBySlug.get(other.slug);
      let count = 0;
      for (const asset of listed) {
        if (!otherIds.has(asset.id)) count += 1;
      }
      if (count > maxGap) maxGap = count;
      return { slug: other.slug, kind: "gap", count };
    });
    return {
      slug: exchange.slug,
      name: exchange.name,
      short: exchange.short,
      ok: Boolean(entry?.ok),
      listed: entry?.ok ? listed.length : null,
      pairCount: entry?.pairCount || 0,
      cells,
    };
  });
  return { rows, maxGap };
}

export function missingElsewhere(assetId, book, exchanges, absentSlug) {
  return exchanges
    .filter((exchange) => {
      if (exchange.slug === absentSlug) return false;
      const entry = book?.[exchange.slug];
      if (!entry?.ok) return false;
      return !assetList(entry).some((asset) => asset.id === assetId);
    })
    .map((exchange) => exchange.short);
}
