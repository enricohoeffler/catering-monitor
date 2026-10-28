import { loadConfig } from "./config.js";
import { CateringexpertClient } from "./cateringexpert-client.js";
import { MqttPublisher, buildMqttPayloads } from "./mqtt-publisher.js";
import { classifyMonitorError } from "./errors.js";
import { applyHolidays, fetchCalendarHolidays } from "./holidays.js";

// Der Ferienkalender ist optional: Fehler dort verhindern den Abruf nicht, die Portalferien gelten weiter.
async function readCalendarHolidays(config, data) {
  const weeks = [data.thisWeek, ...data.weeks];
  try {
    return await fetchCalendarHolidays({ entityId: config.holidayCalendar, start: weeks[0].monday, end: weeks.at(-1).friday });
  } catch (error) {
    console.warn(`[${new Date().toISOString()}] Ferienkalender nicht verfügbar: ${error.message}`);
    return { ranges: [], ok: false };
  }
}

async function runOnce(config, mqttPublisher) {
  const now = new Date();
  const data = await new CateringexpertClient(config.portal).readAll({ weeksAhead: config.weeksAhead, now });
  const calendar = await readCalendarHolidays(config, data);
  data.holidaySources = ["portal", ...(calendar.ok ? [config.holidayCalendar] : [])];
  applyHolidays(data, [...data.vacations, ...calendar.ranges]);
  const checkedAt = now.toISOString();
  await mqttPublisher.publishSnapshot(data, checkedAt);
  const { state } = buildMqttPayloads(data, checkedAt, now);
  console.log(`[${checkedAt}] Erfolgreich: ${data.students.length} Kind(er), ${state.this_week_ordered_days} bestellte Tage diese Woche, ${state.next_week_ordered_days} nächste Woche, Guthaben ${state.balance === null ? "unbekannt" : "abgerufen"}, nächste Frist ${state.next_deadline ?? "keine"}, ${data.holidayRanges.length} Ferienzeiträume (${data.holidaySources.join(" + ")}).`);
}

async function main() {
  const config = loadConfig();
  const mqttPublisher = new MqttPublisher(config.mqtt);
  await mqttPublisher.connect();
  const shutdown = async () => {
    await mqttPublisher.close();
    process.exit(0);
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  do {
    try {
      await runOnce(config, mqttPublisher);
    } catch (error) {
      const failure = classifyMonitorError(error);
      console.error(`[${new Date().toISOString()}] Abruf fehlgeschlagen [${failure.type}]: ${failure.message}`);
      await mqttPublisher.publishFailure(new Date().toISOString(), failure).catch(() => {});
      if (config.mode === "once") process.exitCode = 1;
    }
    if (config.mode !== "daemon") break;
    await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMinutes * 60_000));
  } while (true);
  await mqttPublisher.close();
}

await main();
