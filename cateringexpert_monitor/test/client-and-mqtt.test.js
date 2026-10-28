import test from "node:test";
import assert from "node:assert/strict";
import { assertReadOnlyRequest, CateringexpertClient, extractToken, parseWeekOrders } from "../src/cateringexpert-client.js";
import { PortalAuthError, PortalNetworkError, PortalParserError, ReadOnlyPolicyError } from "../src/errors.js";
import { buildMqttPayloads } from "../src/mqtt-publisher.js";

const baseUrl = "https://catering.example.invalid";

test("Read-only-Policy erlaubt nur Anmeldung und freigegebene Lesezugriffe", () => {
  assert.match(assertReadOnlyRequest(baseUrl, "/api/authenticate", "POST"), /^https:/);
  assert.match(assertReadOnlyRequest(baseUrl, "/api/getAccountTenant"), /^https:/);
  assert.match(assertReadOnlyRequest(baseUrl, "/api/getOrderStudentWeek?mondayDate=2026-10-26&studentId=x"), /^https:/);
});

test("Read-only-Policy blockiert Bestellung, Storno, Überweisung und fremde Hosts", () => {
  assert.throws(() => assertReadOnlyRequest(baseUrl, "/api/addOrderStudentDay", "POST"), ReadOnlyPolicyError);
  assert.throws(() => assertReadOnlyRequest(baseUrl, "/api/cancelOrderStudent", "POST"), ReadOnlyPolicyError);
  assert.throws(() => assertReadOnlyRequest(baseUrl, "/api/transferBalance", "POST"), ReadOnlyPolicyError);
  assert.throws(() => assertReadOnlyRequest(baseUrl, "/api/withdrawFunds", "POST"), ReadOnlyPolicyError);
  assert.throws(() => assertReadOnlyRequest(baseUrl, "/api/getTransactionsUser"), ReadOnlyPolicyError);
  assert.throws(() => assertReadOnlyRequest(baseUrl, "/api/getAccountTenant", "POST"), ReadOnlyPolicyError);
  assert.throws(() => assertReadOnlyRequest(baseUrl, "https://example.org/api/getAccountTenant"), ReadOnlyPolicyError);
});

test("Token wird aus Einzel- und Mehrkontenantwort gelesen", () => {
  assert.equal(extractToken({ token: "a" }, "x@example.invalid"), "a");
  assert.equal(extractToken({ accounts: [{ token: "b", email: "y@example.invalid" }, { token: "c", email: "X@example.invalid" }] }, "x@example.invalid"), "c");
  assert.throws(() => extractToken({}, "x@example.invalid"), PortalAuthError);
});

test("Netzwerkfehler werden getrennt klassifiziert", async () => {
  const client = new CateringexpertClient({ baseUrl, email: "user@example.invalid", password: "secret", fetchImpl: async () => { throw new TypeError("fetch failed"); } });
  await assert.rejects(() => client.login(), PortalNetworkError);
});

test("abgelaufene Sitzung führt zu genau einer Neuanmeldung", async () => {
  let logins = 0;
  let calls = 0;
  const fetchImpl = async (url, options) => {
    if (url.endsWith("/api/authenticate")) {
      logins += 1;
      return new Response(JSON.stringify({ token: `t${logins}` }), { status: 200 });
    }
    calls += 1;
    if (options.headers.authorization === "Bearer t1") return new Response(JSON.stringify({ auth: false, message: "Failed to authenticate token." }), { status: 403 });
    return new Response(JSON.stringify({ currentBalance: 12.5 }), { status: 200 });
  };
  const client = new CateringexpertClient({ baseUrl, email: "user@example.invalid", password: "secret", fetchImpl });
  assert.deepEqual(await client.getJson("/api/getAccountTenant"), { currentBalance: 12.5 });
  assert.equal(logins, 2);
  assert.equal(calls, 2);
});

test("abgelehnte Zugangsdaten sind ein Authentifizierungsfehler", async () => {
  const client = new CateringexpertClient({ baseUrl, email: "user@example.invalid", password: "falsch", fetchImpl: async () => new Response("{}", { status: 401 }) });
  await assert.rejects(() => client.login(), PortalAuthError);
});

test("Wochenbestellungen werden je Tag ausgewertet", () => {
  const days = parseWeekOrders([
    { order: { orderMenus: [{ nameOrder: "Menü 1", amountOrder: 1, priceOrder: 4.2 }, { nameOrder: "Menü 2", amountOrder: 0, priceOrder: 4.2 }] } },
    null,
    { isCanceled: true, order: { orderMenus: [{ nameOrder: "Menü 2", amountOrder: 1, priceOrder: 4.2 }] } },
    { order: { orderMenus: [], specialFoodOrder: [{ nameSpecialFood: "Vegetarisch", amountSpecialFood: 1, priceOrder: 4.5 }] } },
  ], "2026-10-26");
  assert.equal(days.length, 5);
  assert.deepEqual(days.map((day) => day.ordered), [true, false, false, true, false]);
  assert.equal(days[2].canceled, true);
  assert.equal(days[4].date, "2026-10-30");
  assert.throws(() => parseWeekOrders({ error: true }, "2026-10-26"), PortalParserError);
});

test("MQTT-Nutzlast enthält Guthaben, Wochenbestellung und nächste offene Frist", () => {
  const deadline = (value) => new Date(value);
  const days = parseWeekOrders([{ order: { orderMenus: [{ nameOrder: "Menü 1", amountOrder: 1, priceOrder: 4.2 }] } }, null, null, null, null], "2026-10-26");
  const data = {
    balance: 23.4,
    thisWeek: { monday: "2026-10-19", friday: "2026-10-23", week: 43, year: 2026, students: [{ studentId: "s1", firstName: "Kind", days: parseWeekOrders([null, null, { order: { orderMenus: [{ nameOrder: "Menü 2", amountOrder: 1, priceOrder: 4.2 }] } }], "2026-10-19") }] },
    deadlineRule: { mode: "weekly", weeks: 1, weekday: 4, time: "12:00" },
    students: [{ id: "s1", firstName: "Kind" }],
    weeks: [
      { monday: "2026-10-26", friday: "2026-10-30", week: 44, year: 2026, deadline: deadline("2026-10-22T10:00:00Z"), deadlineLast: deadline("2026-10-22T10:00:00Z"), dayDeadlines: Array(5).fill(deadline("2026-10-22T10:00:00Z")), students: [{ studentId: "s1", firstName: "Kind", days }] },
      { monday: "2026-11-02", friday: "2026-11-06", week: 45, year: 2026, deadline: deadline("2026-10-29T11:00:00Z"), deadlineLast: deadline("2026-10-29T11:00:00Z"), dayDeadlines: Array(5).fill(deadline("2026-10-29T11:00:00Z")), students: [{ studentId: "s1", firstName: "Kind", days: parseWeekOrders([], "2026-11-02") }] },
    ],
  };
  const payloads = buildMqttPayloads(data, "2026-10-25T10:00:00.000Z");
  assert.equal(payloads.state.balance, 23.4);
  assert.equal(payloads.state.next_week_ordered_days, 1);
  assert.equal(payloads.state.this_week_ordered_days, 1);
  assert.equal(payloads.attributes.orders_this_week.week, 43);
  assert.equal(payloads.attributes.orders_this_week.students[0].days[2].menu, "Menü 2");
  assert.equal(payloads.state.next_deadline, "2026-10-29T11:00:00.000Z");
  assert.equal(payloads.attributes.orders.total_price, 4.2);
  assert.equal(payloads.attributes.orders.students[0].days[0].menu, "Menü 1");
  assert.equal(payloads.attributes.deadlines.weeks[0].expired, true);
  assert.equal(payloads.attributes.deadlines.next_deadline_week, 45);
  assert.equal(payloads.attributes.deadlines.next_deadline_ordered_days, 0);
  assert.equal("studentId" in payloads.attributes.orders.students[0], false);
});
