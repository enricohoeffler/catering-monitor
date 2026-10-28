import { describeDeadlineRule } from "./deadlines.js";

const WEEK_LIMIT = 8;

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function dayPrice(day) {
  if (!day.ordered) return 0;
  return day.items.reduce((sum, item) => sum + (item.price ?? 0) * item.amount, 0);
}

export function orderedDayCount(week) {
  return week.students.reduce((sum, student) => sum + student.days.filter((day) => day.ordered).length, 0);
}

function iso(value) {
  return value instanceof Date ? value.toISOString() : null;
}

export function buildWeekOrders(week) {
  if (!week) return { week: null, year: null, monday: null, friday: null, ordered_days: 0, total_price: 0, students: [] };
  return {
    week: week.week,
    year: week.year,
    monday: week.monday,
    friday: week.friday,
    ordered_days: orderedDayCount(week),
    total_price: roundMoney(week.students.reduce((sum, student) => sum + student.days.reduce((daySum, day) => daySum + dayPrice(day), 0), 0)),
    students: week.students.map((student) => ({
      name: student.firstName,
      ordered_days: student.days.filter((day) => day.ordered).length,
      days: student.days.map((day) => ({
        date: day.date,
        weekday: day.weekday,
        ordered: day.ordered,
        canceled: day.canceled,
        holiday: Boolean(day.holiday),
        menu: day.items.map((item) => (item.amount > 1 ? `${item.amount}× ${item.name}` : item.name)).join(", "),
        price: roundMoney(dayPrice(day)),
      })),
    })),
  };
}

export function buildDeadlines(data, now) {
  const weeks = data.weeks.slice(0, WEEK_LIMIT).map((week) => ({
    week: week.week,
    year: week.year,
    monday: week.monday,
    deadline: iso(week.deadline),
    deadline_last: iso(week.deadlineLast),
    expired: week.deadlineLast ? week.deadlineLast <= now : false,
    holiday: Boolean(week.holiday),
    holiday_days: week.holidayDates?.length ?? 0,
    ordered_days: orderedDayCount(week),
    possible_days: week.students.length * (5 - (week.holidayDates?.length ?? 0)),
  }));
  // Nächste noch offene Frist: Ferientage zählen nicht; bei Tagesfristen zählt der früheste offene Essenstag.
  const open = (week) => week.openDeadlines ?? week.dayDeadlines ?? [];
  const next = data.weeks.find((week) => open(week).some((deadline) => deadline > now));
  const nextDeadline = next ? open(next).find((deadline) => deadline > now) : null;
  return {
    rule: describeDeadlineRule(data.deadlineRule),
    next_deadline: iso(nextDeadline),
    next_deadline_week: next ? next.week : null,
    next_deadline_monday: next ? next.monday : null,
    next_deadline_ordered_days: next ? orderedDayCount(next) : null,
    holiday_sources: data.holidaySources ?? [],
    weeks,
  };
}
