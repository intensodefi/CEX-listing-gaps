export function columnFiltersActive(filters = {}) {
  return ["platform", "tag", "missing"].some((key) => (filters[key] || []).length > 0);
}

export function matchesColumnFilters(row, filters = {}) {
  const excludedPlatforms = filters.platform || [];
  const excludedTags = filters.tag || [];
  const excludedMissing = filters.missing || [];
  // An empty list means every value stays selected. A listed value is hidden.
  if (excludedPlatforms.includes(row.platform)) return false;
  if (excludedTags.some((tag) => (row.tags || []).includes(tag))) return false;
  if (excludedMissing.some((label) => (row.missing || []).includes(label))) return false;
  return true;
}
