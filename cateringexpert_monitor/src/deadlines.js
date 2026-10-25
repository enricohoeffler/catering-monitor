// Datums- und Fristlogik, nachgebildet nach der Cateringexpert-Weboberfläche (Zeitzone Europe/Berlin).
export const TIMEZONE = "Europe/Berlin";
export const WEEKDAY_LABELS = Object.freeze(["Mo", "Di", "Mi", "Do", "Fr"]);
const WEEKDAY_NAMES = Object.freeze({ 1: "Montag", 2: "Dienstag", 3: "Mittwoch", 4: "Donnerstag", 5: "Freitag", 6: "Samstag", 7: "Sonntag" });
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function parseDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(value, days) {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

export function isoWeekday(value) {
  const day = parseDate(value).getUTCDay();
  return day === 0 ? 7 : day;
}

export function isoMonday(value) {
  return addDays(value, 1 - isoWeekday(value));
}

export function isoWeek(value) {
  const thursday = addDays(isoMonday(value), 3);
  const year = Number(thursday.slice(0, 4));
  const dayOfYear = Math.round((parseDate(thursday) - Date.UTC(year, 0, 1)) / 86_400_000);
  return { week: Math.floor(dayOfYear / 7) + 1, year };
}

function zonedParts(timestamp, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function localDate(now, timeZone = TIMEZONE) {
  const parts = zonedParts(now.getTime(), timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function offsetMs(timestamp, timeZone) {
  const parts = zonedParts(timestamp, timeZone);
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return asUtc - Math.floor(timestamp / 1000) * 1000;
}

// Lokale Uhrzeit in einer Zeitzone in einen absoluten Zeitpunkt umrechnen (sommerzeitfest).
export function zonedToUtc(value, time, timeZone = TIMEZONE) {
  const [year, month, day] = value.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = guess - offsetMs(guess, timeZone);
  return new Date(guess - offsetMs(first, timeZone));
}

function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function validTime(value) {
  return typeof value === "string" && TIME_PATTERN.test(value);
}

export function parseDeadlineRule(generalSettings) {
  if (!generalSettings || typeof generalSettings !== "object") return null;
  if (generalSettings.isDeadlineDaily) {
    const daily = generalSettings.deadlineDaily || {};
    if (!validTime(daily.time)) return null;
    return { mode: "daily", days: Math.max(0, toInt(daily.day, 1)), time: daily.time, skipWeekend: Boolean(generalSettings.deadlineSkipWeekend) };
  }
  const weekly = generalSettings.deadlineWeekly || {};
  if (!validTime(weekly.time)) return null;
  return { mode: "weekly", weeks: Math.max(0, toInt(weekly.weeks, 0)), weekday: Math.min(7, Math.max(1, toInt(weekly.day, 1))), time: weekly.time };
}

export function describeDeadlineRule(rule) {
  if (!rule) return "Keine Bestellfrist hinterlegt";
  if (rule.mode === "daily") {
    const unit = rule.skipWeekend ? "Werktag" : "Tag";
    if (rule.days === 0) return `Bestellfrist endet am selben Tag um ${rule.time} Uhr`;
    if (rule.days === 1) return `Bestellfrist endet am ${rule.skipWeekend ? "vorherigen Werktag" : "Vortag"} um ${rule.time} Uhr`;
    return `Bestellfrist endet ${rule.days} ${unit}e vorher um ${rule.time} Uhr`;
  }
  const when = rule.weeks === 0 ? "in derselben Woche" : rule.weeks === 1 ? "in der Vorwoche" : `${rule.weeks} Wochen vor der Bestellwoche`;
  return `Bestellfrist endet ${when} am ${WEEKDAY_NAMES[rule.weekday]} um ${rule.time} Uhr`;
}

// Bestellschluss für einen einzelnen Essenstag.
export function dayDeadline(rule, value) {
  if (rule.mode === "weekly") {
    const deadlineDay = addDays(isoMonday(value), rule.weekday - 1 - 7 * rule.weeks);
    return zonedToUtc(deadlineDay, rule.time);
  }
  let deadlineDay = value;
  if (rule.skipWeekend) {
    let counted = 0;
    while (counted < rule.days) {
      deadlineDay = addDays(deadlineDay, -1);
      if (isoWeekday(deadlineDay) <= 5) counted += 1;
    }
  } else {
    deadlineDay = addDays(value, -rule.days);
  }
  return zonedToUtc(deadlineDay, rule.time);
}

// Kommende Bestellwochen, beginnend mit der nächsten Kalenderwoche.
export function upcomingWeeks(now, count) {
  const nextMonday = addDays(isoMonday(localDate(now)), 7);
  return Array.from({ length: count }, (_value, index) => {
    const monday = addDays(nextMonday, 7 * index);
    return { monday, friday: addDays(monday, 4), ...isoWeek(monday) };
  });
}
