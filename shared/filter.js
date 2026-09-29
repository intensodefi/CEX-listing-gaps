export function columnFiltersActive(filters = {}) {
  return ["platform", "tag", "missing"].some((key) => (filters[key] || []).length > 0);
}

export function matchesColumnFilters(row, filters = {}) {
  const platform = filters.platform || [];
  const tags = filters.tag || [];
  const missing = filters.missing || [];
  if (platform.length && !platform.includes(row.platform)) return false;
  if (tags.length && !tags.some((tag) => (row.tags || []).includes(tag))) return false;
  if (missing.length && !missing.some((label) => (row.missing || []).includes(label))) return false;
  return true;
}
