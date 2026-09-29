export function isStablecoin(tags) {
  return Array.isArray(tags) && tags.includes("stablecoin");
}

export function consideredCoins(coins, includeStable) {
  return coins.filter((coin) => includeStable || !coin.stable);
}

export function filterGaps(coins, { present, absent, query = "", includeStable = false }) {
  const needle = query.trim().toLowerCase();
  return consideredCoins(coins, includeStable)
    .filter((coin) => {
      if (!coin.exchanges.includes(present) || coin.exchanges.includes(absent)) return false;
      if (!needle) return true;
      return (
        coin.symbol.toLowerCase().includes(needle) ||
        coin.name.toLowerCase().includes(needle)
      );
    })
    .sort((a, b) => a.rank - b.rank);
}

export function overlapStats(coins, present, absent, includeStable = false) {
  const universe = consideredCoins(coins, includeStable);
  const onPresent = universe.filter((coin) => coin.exchanges.includes(present));
  const onBoth = onPresent.filter((coin) => coin.exchanges.includes(absent));
  const onAbsent = universe.filter((coin) => coin.exchanges.includes(absent));
  return {
    considered: universe.length,
    onPresent: onPresent.length,
    onAbsent: onAbsent.length,
    onBoth: onBoth.length,
    gap: onPresent.length - onBoth.length,
    reverseGap: onAbsent.length - onBoth.length,
    coverage: onPresent.length ? onBoth.length / onPresent.length : null,
  };
}

export function buildMatrix(coins, exchanges, includeStable = false) {
  const universe = consideredCoins(coins, includeStable);
  let maxGap = 0;
  const rows = exchanges.map((exchange) => {
    const listed = universe.filter((coin) => coin.exchanges.includes(exchange.slug));
    const cells = exchanges.map((other) => {
      if (other.slug === exchange.slug) {
        return { slug: other.slug, kind: "self", count: listed.length };
      }
      const count = listed.filter((coin) => !coin.exchanges.includes(other.slug)).length;
      if (count > maxGap) maxGap = count;
      return { slug: other.slug, kind: "gap", count };
    });
    return { slug: exchange.slug, name: exchange.name, short: exchange.short, listed: listed.length, cells };
  });
  return { rows, maxGap };
}

export function missingElsewhere(coin, exchanges, absentSlug) {
  return exchanges
    .filter((exchange) => exchange.slug !== absentSlug && !coin.exchanges.includes(exchange.slug))
    .map((exchange) => exchange.short);
}
