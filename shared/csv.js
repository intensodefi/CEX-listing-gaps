const COLUMNS = [
  ["symbol", "symbol"],
  ["name", "name"],
  ["id", "id"],
  ["slug", "slug"],
  ["pairs", "pairs"],
  ["quotes", "quotes"],
  ["tags", "tags"],
  ["platform", "platform"],
  ["token_address", "tokenAddress"],
  ["also_missing_from", "missing"],
];

export function platformLabel(profile) {
  if (!profile) return "";
  return profile.platform || "Native";
}

function cell(value) {
  if (Array.isArray(value)) return value.join("; ");
  if (value === null || value === undefined) return "";
  return String(value);
}

function escapeCell(value) {
  const text = cell(value);
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function tableToCsv(rows) {
  const header = COLUMNS.map(([name]) => name).join(",");
  const lines = rows.map((row) => COLUMNS.map(([, key]) => escapeCell(row[key])).join(","));
  return `${header}\n${lines.join("\n")}${lines.length ? "\n" : ""}`;
}
