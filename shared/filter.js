function selectionMatches(selection, values) {
  if (!selection || selection.mode === "all" || !selection.mode) return true;
  if (selection.mode === "none") return false;
  const picked = selection.values || [];
  return values.some((value) => picked.includes(value));
}

export function columnFiltersActive(filters = {}) {
  return ["platform", "tag"].some((key) => {
    const selection = filters[key];
    return Boolean(selection && selection.mode && selection.mode !== "all");
  });
}

export function matchesColumnFilters(row, filters = {}) {
  const platform = row.platform ? [row.platform] : [];
  if (!selectionMatches(filters.platform, platform)) return false;
  if (!selectionMatches(filters.tag, row.tags || [])) return false;
  return true;
}
