import test from "node:test";
import assert from "node:assert/strict";
import { applyHolidays, fetchCalendarHolidays, isHoliday, parseCalendarEvents, parsePortalVacations } from "../src/holidays.js";
import { parseWeekOrders } from "../src/cateringexpert-client.js";
import { addDays, dayDeadline } from "../src/deadlines.js";
import { buildDeadlines, buildWeekOrders } from "../src/report.js";
import { PortalParserError } from "../src/errors.js";

test("Portalferien haben ein inklusives Enddatum", () => {
  const ranges = parsePortalVacations([{ vacation: { vacationStart: "2026-12-24T00:00:00.000Z", vacationEnd: "2027-01-08T00:00:00.000Z" } }, { vacation: {} }]);
  assert.deepEqual(ranges, [{ start: "2026-12-24", end: "2027-01-08", source: "portal" }]);
  assert.throws(() => parsePortalVacations({ error: true }), PortalParserError);
});

test("ganztägige Kalendertermine haben ein exklusives Enddatum", () => {
  const ranges = parseCalendarEvents([
    { start: { date: "2026-11-02" }, end: { date: "2026-11-07" } },
    { start: { date: "2026-11-18" }, end: { date: "2026-11-19" } },
  ]);
  assert.deepEqual(ranges.map(({ start, end }) => [start, end]), [["2026-11-02", "2026-11-06"], ["2026-11-18", "2026-11-18"]]);
  assert.equal(isHoliday(ranges, "2026-11-06"), true);
  assert.equal(isHoliday(ranges, "2026-11-09"), false);
  assert.deepEqual(parseCalendarEvents(null), []);
});

function makeWeek(monday, rule) {
  const dayDeadlines = [0, 1, 2, 3, 4].map((index) => dayDeadline(rule, addDays(monday, index)));
  return {
    monday, friday: addDays(monday, 4), week: 0, year: 2026,
    deadline: dayDeadlines[0], deadlineLast: dayDeadlines[4], dayDeadlines,
    students: [{ studentId: "s1", firstName: "Kind", days: parseWeekOrders([], monday) }],
  };
}

test("Ferienwoche wird bei der nächsten Frist übersprungen", () => {
  const rule = { mode: "weekly", weeks: 1, weekday: 5, time: "12:00" };
  const data = { deadlineRule: rule, thisWeek: makeWeek("2026-10-26", rule), weeks: [makeWeek("2026-11-02", rule), makeWeek("2026-11-09", rule), makeWeek("2026-11-16", rule)] };
  applyHolidays(data, [{ start: "2026-11-02", end: "2026-11-06" }, { start: "2026-11-18", end: "2026-11-18" }]);
  const result = buildDeadlines(data, new Date("2026-10-28T19:00:00Z"));
  assert.equal(result.next_deadline_monday, "2026-11-09");
  assert.equal(result.next_deadline, "2026-11-06T11:00:00.000Z");
  assert.equal(result.weeks[0].holiday, true);
  assert.equal(result.weeks[0].possible_days, 0);
  assert.equal(result.weeks[2].holiday, false);
  assert.equal(result.weeks[2].holiday_days, 1);
  assert.equal(result.weeks[2].possible_days, 4);
  assert.equal(buildWeekOrders(data.weeks[0]).students[0].days[0].holiday, true);
});

test("Tagesfrist überspringt einzelne Ferientage", () => {
  const rule = { mode: "daily", days: 1, time: "09:00", skipWeekend: true };
  const data = { deadlineRule: rule, thisWeek: makeWeek("2026-11-16", rule), weeks: [makeWeek("2026-11-16", rule)] };
  applyHolidays(data, [{ start: "2026-11-18", end: "2026-11-18" }]);
  // Dienstag 17.11. 08:00 Berlin: Die Frist für Mittwoch (Di 09:00) liegt noch in der Zukunft,
  // zählt aber als Ferientag nicht; nächste ist die für Donnerstag (Mi 09:00).
  const result = buildDeadlines(data, new Date("2026-11-17T07:00:00Z"));
  assert.equal(result.next_deadline, "2026-11-18T08:00:00.000Z");
});

test("Ferienkalender: nur gültige Entitäten, ohne Token kein Abruf", async () => {
  await assert.rejects(() => fetchCalendarHolidays({ entityId: "calendar.x/../../services", start: "2026-11-01", end: "2026-11-30", token: "t" }));
  assert.deepEqual(await fetchCalendarHolidays({ entityId: "calendar.ferien", start: "2026-11-01", end: "2026-11-30", token: "" }), { ranges: [], ok: null });
  let requested = "";
  const fetchImpl = async (url, options) => {
    requested = `${options.method} ${url}`;
    return new Response(JSON.stringify([{ start: { date: "2026-11-02" }, end: { date: "2026-11-07" } }]), { status: 200 });
  };
  const result = await fetchCalendarHolidays({ entityId: "calendar.ferien", start: "2026-11-01", end: "2026-11-30", token: "t", fetchImpl });
  assert.match(requested, /^GET http:\/\/supervisor\/core\/api\/calendars\/calendar\.ferien\?/);
  assert.equal(result.ok, true);
  assert.equal(result.ranges[0].end, "2026-11-06");
});
