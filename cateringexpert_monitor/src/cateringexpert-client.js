import {
  PortalAuthError,
  PortalNetworkError,
  PortalParserError,
  PortalResponseError,
  ReadOnlyPolicyError,
} from "./errors.js";
import { addDays, dayDeadline, parseDeadlineRule, upcomingWeeks, WEEKDAY_LABELS } from "./deadlines.js";

// Die API kennt auch Bestell-, Storno-, Überweisungs- und Auszahlungsendpunkte.
// Deshalb sind ausschließlich die folgenden Pfade erlaubt.
const ALLOWED_GET_PATHS = new Set([
  "/api/healthcheck",
  "/api/getregisteredstudentsuser",
  "/api/getcustomerinfo",
  "/api/getaccounttenant",
  "/api/getorderstudentweek",
]);
const ALLOWED_POST_PATHS = new Set([
  "/api/authenticate",
]);

export function assertReadOnlyRequest(baseUrl, target, method = "GET") {
  const portal = new URL(baseUrl);
  const url = new URL(target, `${portal.toString().replace(/\/$/, "")}/`);
  const normalizedMethod = method.toUpperCase();
  const path = url.pathname.toLowerCase().replace(/\/$/, "");

  if (url.origin !== portal.origin) {
    throw new ReadOnlyPolicyError("Read-only-Schutz: Anfrage außerhalb des konfigurierten Portals blockiert.");
  }
  if (normalizedMethod === "GET" && ALLOWED_GET_PATHS.has(path)) return url.toString();
  if (normalizedMethod === "POST" && ALLOWED_POST_PATHS.has(path)) return url.toString();
  throw new ReadOnlyPolicyError(`Read-only-Schutz: ${normalizedMethod}-Anfrage auf ${url.pathname} blockiert.`);
}

function toNumber(value) {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanText(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function unwrapList(payload, keys) {
  if (Array.isArray(payload)) return payload;
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return null;
}

export function extractToken(payload, email) {
  if (Array.isArray(payload?.accounts) && payload.accounts.length > 0) {
    const wanted = email.toLowerCase();
    const account = payload.accounts.find((entry) => String(entry?.email || "").toLowerCase() === wanted) || payload.accounts[0];
    if (typeof account?.token === "string" && account.token) return account.token;
  }
  if (typeof payload?.token === "string" && payload.token) return payload.token;
  throw new PortalAuthError("Anmeldung fehlgeschlagen: Antwort enthält kein Token.");
}

export function parseStudents(payload) {
  const list = unwrapList(payload, ["students", "data", "result"]);
  if (!list) throw new PortalParserError("Unerwartete Antwort für registrierte Kinder.");
  return list
    .filter((student) => student && (student._id || student.id))
    .map((student) => ({ id: String(student._id || student.id), firstName: cleanText(student.firstName) || "Kind" }));
}

export function parseBalance(payload) {
  if (!payload || typeof payload !== "object") throw new PortalParserError("Unerwartete Antwort für das Kundenkonto.");
  return toNumber(payload.currentBalance);
}

export function parseCustomer(payload) {
  if (!payload || typeof payload !== "object" || !payload.generalSettings) {
    throw new PortalParserError("Unerwartete Antwort für die Einrichtungseinstellungen.");
  }
  return { deadlineRule: parseDeadlineRule(payload.generalSettings) };
}

export function parseWeekOrders(payload, mondayDate) {
  if (!Array.isArray(payload)) throw new PortalParserError("Unerwartete Antwort für Wochenbestellungen.");
  return WEEKDAY_LABELS.map((weekday, index) => {
    const entry = payload[index];
    const items = [];
    if (entry && typeof entry === "object") {
      for (const menu of entry.order?.orderMenus ?? []) {
        const amount = toNumber(menu?.amountOrder) ?? 0;
        if (amount > 0 || (menu?.menuSelected === true && menu?.amountOrder == null)) {
          items.push({ name: cleanText(menu.nameOrder) || "Menü", amount: amount || 1, price: toNumber(menu.priceOrder) });
        }
      }
      for (const special of entry.order?.specialFoodOrder ?? []) {
        const amount = toNumber(special?.amountSpecialFood) ?? 0;
        if (amount > 0) items.push({ name: cleanText(special.nameSpecialFood) || "Sonderkost", amount, price: toNumber(special.priceOrder) });
      }
    }
    const canceled = Boolean(entry?.isCanceled);
    return { date: addDays(mondayDate, index), weekday, ordered: !canceled && items.length > 0, canceled, items };
  });
}

export class CateringexpertClient {
  constructor({ baseUrl, email, password, fetchImpl = fetch, timeoutMs = 20_000 }) {
    this.baseUrl = baseUrl;
    this.email = email;
    this.password = password;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.token = null;
  }

  async request(path, { method = "GET", params, body, auth = true } = {}) {
    const target = params ? `${path}?${new URLSearchParams(params)}` : path;
    const url = assertReadOnlyRequest(this.baseUrl, target, method);
    const headers = { accept: "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (auth && this.token) headers.authorization = `Bearer ${this.token}`;
    let response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new PortalNetworkError("Cateringexpert ist nicht erreichbar.", { cause: error });
    }
    const text = await response.text();
    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch (error) {
        if (response.ok) throw new PortalParserError(`Antwort von ${path} ist kein JSON.`, { cause: error });
      }
    }
    return { status: response.status, ok: response.ok, payload };
  }

  async login() {
    const { status, ok, payload } = await this.request("/api/authenticate", {
      method: "POST",
      body: { email: this.email, password: this.password },
      auth: false,
    });
    if (status === 400 || status === 401 || status === 403 || status === 404) {
      throw new PortalAuthError("Anmeldung fehlgeschlagen: Zugangsdaten wurden abgelehnt.");
    }
    if (!ok) throw new PortalResponseError(`Anmeldung fehlgeschlagen (HTTP ${status}).`);
    this.token = extractToken(payload, this.email);
  }

  async getJson(path, params) {
    if (!this.token) await this.login();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { status, ok, payload } = await this.request(path, { params });
      const authRejected = status === 401 || (status === 403 && payload?.auth === false);
      if (ok && payload?.auth !== false) return payload;
      if (authRejected && attempt === 0) {
        this.token = null;
        await this.login();
        continue;
      }
      if (authRejected) throw new PortalAuthError("Sitzung wurde auch nach erneuter Anmeldung abgelehnt.");
      throw new PortalResponseError(`Abruf von ${path} fehlgeschlagen (HTTP ${status}).`);
    }
    throw new PortalAuthError("Sitzung konnte nicht erneuert werden.");
  }

  async readAll({ weeksAhead = 3, now = new Date() } = {}) {
    const students = parseStudents(await this.getJson("/api/getRegisteredStudentsUser"));
    const { deadlineRule } = parseCustomer(await this.getJson("/api/getCustomerInfo"));
    const balance = parseBalance(await this.getJson("/api/getAccountTenant"));

    const weeks = [];
    for (const week of upcomingWeeks(now, weeksAhead)) {
      const studentOrders = [];
      for (const student of students) {
        const raw = await this.getJson("/api/getOrderStudentWeek", { mondayDate: week.monday, studentId: student.id });
        studentOrders.push({ studentId: student.id, firstName: student.firstName, days: parseWeekOrders(raw, week.monday) });
      }
      const dayDeadlines = deadlineRule ? WEEKDAY_LABELS.map((_label, index) => dayDeadline(deadlineRule, addDays(week.monday, index))) : [];
      weeks.push({
        ...week,
        deadline: dayDeadlines[0] ?? null,
        deadlineLast: dayDeadlines.at(-1) ?? null,
        dayDeadlines,
        students: studentOrders,
      });
    }
    return { balance, deadlineRule, students, weeks };
  }
}
