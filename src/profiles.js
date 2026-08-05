export async function loadProfileConfig() {
  const url = new URL("config/label-profiles.json", new URL(import.meta.env.BASE_URL, location.origin));
  url.searchParams.set("v", String(Date.now()));
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Profilkonfiguration konnte nicht geladen werden (HTTP ${response.status}).`);
  const config = await response.json();
  validateConfig(config);
  return config;
}

export function validateConfig(config) {
  if (!config || config.schema !== "label-profiles" || Number(config.schemaVersion) !== 2) {
    throw new Error("Nicht unterstützte Profilkonfiguration.");
  }
  if (!config.profiles || typeof config.profiles !== "object") throw new Error("In der Profilkonfiguration fehlen die Formate.");
  return true;
}

export function profilesForRole(config, role, { includeUnconfigured = false } = {}) {
  return Object.values(config?.profiles || {}).filter((profile) =>
    profile?.role === role && profile?.active !== false && (includeUnconfigured || profile?.configured !== false)
  );
}
