export function refreshAllowed(env = process.env) {
  const flag = String(env.DISABLE_REFRESH ?? "").trim().toLowerCase();
  if (flag === "1" || flag === "true" || flag === "yes") return false;
  if (flag === "0" || flag === "false" || flag === "no") return true;
  return !env.RAILWAY_ENVIRONMENT && !env.RAILWAY_PROJECT_ID;
}
