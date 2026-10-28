import test from "node:test";
import assert from "node:assert/strict";
import { currentWeek, dayDeadline, describeDeadlineRule, isoWeek, parseDeadlineRule, upcomingWeeks, zonedToUtc } from "../src/deadlines.js";

test("Ortszeit Berlin wird sommerzeitfest umgerechnet", () => {
  assert.equal(zonedToUtc("2026-10-23", "12:00").toISOString(), "2026-10-23T10:00:00.000Z");
  assert.equal(zonedToUtc("2026-10-30", "12:00").toISOString(), "2026-10-30T11:00:00.000Z");
  assert.equal(zonedToUtc("2026-03-30", "08:30").toISOString(), "2026-03-30T06:30:00.000Z");
});

test("ISO-Kalenderwochen über den Jahreswechsel", () => {
  assert.deepEqual(isoWeek("2026-10-26"), { week: 44, year: 2026 });
  assert.deepEqual(isoWeek("2026-12-28"), { week: 53, year: 2026 });
  assert.deepEqual(isoWeek("2027-01-04"), { week: 1, year: 2027 });
});

test("kommende Wochen beginnen mit dem nächsten Montag", () => {
  const weeks = upcomingWeeks(new Date("2026-10-25T10:00:00Z"), 2);
  assert.deepEqual(weeks.map((week) => week.monday), ["2026-10-26", "2026-11-02"]);
  assert.equal(weeks[0].friday, "2026-10-30");
  const fromMonday = upcomingWeeks(new Date("2026-10-26T06:00:00Z"), 1);
  assert.equal(fromMonday[0].monday, "2026-11-02");
});

test("Wochenfrist: Vorwoche Donnerstag 12:00", () => {
  const rule = parseDeadlineRule({ isDeadlineDaily: false, deadlineWeekly: { weeks: "1", day: "4", time: "12:00" } });
  assert.equal(dayDeadline(rule, "2026-11-02").toISOString(), "2026-10-29T11:00:00.000Z");
  assert.equal(dayDeadline(rule, "2026-11-06").toISOString(), "2026-10-29T11:00:00.000Z");
  assert.match(describeDeadlineRule(rule), /Vorwoche am Donnerstag um 12:00/);
});

test("Tagesfrist mit und ohne Wochenendüberspringen", () => {
  const plain = parseDeadlineRule({ isDeadlineDaily: true, deadlineDaily: { day: "1", time: "09:00" } });
  assert.equal(dayDeadline(plain, "2026-11-02").toISOString(), "2026-11-01T08:00:00.000Z");
  const skip = parseDeadlineRule({ isDeadlineDaily: true, deadlineSkipWeekend: true, deadlineDaily: { day: "1", time: "09:00" } });
  assert.equal(dayDeadline(skip, "2026-11-02").toISOString(), "2026-10-30T08:00:00.000Z");
});

test("ungültige Fristeinstellungen ergeben keine Regel", () => {
  assert.equal(parseDeadlineRule(null), null);
  assert.equal(parseDeadlineRule({ isDeadlineDaily: false, deadlineWeekly: { weeks: 1, day: 4, time: "25:00" } }), null);
  assert.equal(describeDeadlineRule(null), "Keine Bestellfrist hinterlegt");
});

test("laufende Woche beginnt am Montag dieser Woche", () => {
  assert.equal(currentWeek(new Date("2026-10-28T18:00:00Z")).monday, "2026-10-26");
  assert.equal(currentWeek(new Date("2026-11-01T22:30:00Z")).monday, "2026-10-26");
  assert.equal(currentWeek(new Date("2026-11-01T23:30:00Z")).monday, "2026-11-02");
  assert.equal(currentWeek(new Date("2026-10-25T10:00:00Z")).week, 43);
});
