// Ferien und Schließtage: Zeiträume aus dem Portal und optional aus einem Home-Assistant-Kalender.
// Alle Zeiträume werden als { start, end } mit inklusivem Enddatum (YYYY-MM-DD) geführt.
import { addDays, localDate, WEEKDAY_LABELS } from "./deadlines.js";
import { PortalParserError } from "./errors.js";

const CALENDAR_ENTITY_PATTERN = /^calendar\.[a-z0-9_]+$/;

export function parsePortalVacations(payload) {
  if (!Array.isArray(payload)) throw new PortalParserError("Unerwartete Antwort für Ferienzeiten.");
  return payload
    .map((entry) => entry?.vacation || entry)
    .filter((vacation) => vacation?.vacationStart && vacation?.vacationEnd)
    .map((vacation) => ({
      start: localDate(new Date(vacation.vacationStart)),
      end: localDate(new Date(vacation.vacationEnd)),
      source: "portal",
    }))
    .filter((range) => range.start <= range.end);
}

// HA-Kalender: ganztägige Termine haben ein exklusives Enddatum.
export function parseCalendarEvents(payload) {
  if (!Array.isArray(payload)) return [];
  return payload
    .map((event) => {
      if (event?.start?.date && event?.end?.date) {
        return { start: event.start.date, end: addDays(event.end.date, -1) };
      }
      if (event?.start?.dateTime && event?.end?.dateTime) {
        return { start: localDate(new Date(event.start.dateTime)), end: localDate(new Date(new Date(event.end.dateTime).getTime() - 1)) };
      }
      return null;
    })
    .filter((range) => range && range.start <= range.end)
    .map((range) => ({ ...range, source: "calendar" }));
}

export function isHoliday(ranges, date) {
  return ranges.some((range) => date >= range.start && date <= range.end);
}

// Liest einen HA-Kalender über die Supervisor-Core-API (nur GET, nur calendar.*-Entitäten).
export async function fetchCalendarHolidays({ entityId, start, end, token = process.env.SUPERVISOR_TOKEN, fetchImpl = fetch }) {
  if (!entityId) return { ranges: [], ok: null };
  if (!CALENDAR_ENTITY_PATTERN.test(entityId)) throw new Error(`Ungültige Kalender-Entität: ${entityId}`);
  if (!token) return { ranges: [], ok: null };
  const query = new URLSearchParams({ start: `${start}T00:00:00Z`, end: `${end}T23:59:59Z` });
  const response = await fetchImpl(`http://supervisor/core/api/calendars/${entityId}?${query}`, {
    method: "GET",
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Ferienkalender nicht lesbar (HTTP ${response.status}).`);
  return { ranges: parseCalendarEvents(await response.json()), ok: true };
}

// Markiert Ferientage in den Wochen und bestimmt die Fristen, die tatsächlich gelten.
export function applyHolidays(data, ranges) {
  const mark = (week) => {
    if (!week) return;
    const dates = WEEKDAY_LABELS.map((_label, index) => addDays(week.monday, index));
    week.holidayDates = dates.filter((date) => isHoliday(ranges, date));
    week.holiday = week.holidayDates.length === dates.length;
    for (const student of week.students) {
      for (const day of student.days) day.holiday = isHoliday(ranges, day.date);
    }
    if (week.dayDeadlines) {
      week.openDeadlines = week.dayDeadlines.filter((_deadline, index) => !isHoliday(ranges, dates[index]));
    }
  };
  mark(data.thisWeek);
  data.weeks.forEach(mark);
  data.holidayRanges = ranges;
  return data;
}
