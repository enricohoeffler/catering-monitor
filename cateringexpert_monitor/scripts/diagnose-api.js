// Gibt nur die Struktur (Schlüssel und Typen) der API-Antworten aus, keine Werte.
// Aufruf: npm run diagnose:api (liest Zugangsdaten aus .env)
import { CateringexpertClient } from "../src/cateringexpert-client.js";
import { upcomingWeeks } from "../src/deadlines.js";
import { loadConfig } from "../src/config.js";

function shape(value, depth = 0) {
  if (Array.isArray(value)) return value.length === 0 ? "[]" : [shape(value.find((entry) => entry != null) ?? null, depth + 1), `…${value.length}`];
  if (value === null) return "null";
  if (typeof value !== "object") return typeof value;
  if (depth > 5) return "{…}";
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, shape(entry, depth + 1)]));
}

const config = loadConfig();
const client = new CateringexpertClient(config.portal);
await client.login();
console.log("Anmeldung erfolgreich.");

const students = await client.getJson("/api/getRegisteredStudentsUser");
console.log("getRegisteredStudentsUser:", JSON.stringify(shape(students), null, 2));
const customer = await client.getJson("/api/getCustomerInfo");
console.log("getCustomerInfo.generalSettings:", JSON.stringify(shape(customer?.generalSettings), null, 2));
const account = await client.getJson("/api/getAccountTenant");
console.log("getAccountTenant:", JSON.stringify(shape(account), null, 2));

const firstStudent = Array.isArray(students) ? students[0] : null;
if (firstStudent?._id) {
  const [week] = upcomingWeeks(new Date(), 1);
  const orders = await client.getJson("/api/getOrderStudentWeek", { mondayDate: week.monday, studentId: firstStudent._id });
  console.log("getOrderStudentWeek:", JSON.stringify(shape(orders), null, 2));
}
