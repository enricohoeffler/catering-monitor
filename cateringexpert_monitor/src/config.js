function envInt(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) ? value : fallback;
}

function envBool(name, fallback = false) {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

export function loadConfig() {
  const config = {
    portal: {
      baseUrl: (process.env.PORTAL_BASE_URL || "https://essen.cateringexpert.de").replace(/\/$/, ""),
      email: process.env.CATERINGEXPERT_EMAIL || "",
      password: process.env.CATERINGEXPERT_PASSWORD || "",
    },
    mode: process.env.MODE === "daemon" ? "daemon" : "once",
    pollIntervalMinutes: Math.max(15, envInt("POLL_INTERVAL_MINUTES", 120)),
    weeksAhead: Math.min(8, Math.max(1, envInt("WEEKS_AHEAD", 3))),
    holidayCalendar: (process.env.HOLIDAY_CALENDAR || "").trim(),
    mqtt: {
      enabled: envBool("MQTT_ENABLED", false),
      host: process.env.MQTT_HOST || "",
      port: envInt("MQTT_PORT", 1883),
      username: process.env.MQTT_USERNAME || "",
      password: process.env.MQTT_PASSWORD || "",
      discoveryPrefix: process.env.MQTT_DISCOVERY_PREFIX || "homeassistant",
      baseTopic: process.env.MQTT_BASE_TOPIC || "cateringexpert",
    },
  };

  if (!config.portal.email || !config.portal.password) {
    throw new Error("CATERINGEXPERT_EMAIL und CATERINGEXPERT_PASSWORD müssen gesetzt sein.");
  }
  return config;
}
