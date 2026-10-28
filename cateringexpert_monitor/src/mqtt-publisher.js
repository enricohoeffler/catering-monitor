import mqtt from "mqtt";
import { buildDeadlines, buildWeekOrders } from "./report.js";

async function supervisorMqttConfig() {
  const token = process.env.SUPERVISOR_TOKEN;
  if (!token) return null;
  const response = await fetch("http://supervisor/services/mqtt", {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`MQTT-Diensterkennung fehlgeschlagen (${response.status}).`);
  const payload = await response.json();
  const data = payload.data || payload;
  return {
    host: data.host,
    port: Number(data.port || 1883),
    username: data.username || "",
    password: data.password || "",
    protocol: data.ssl ? "mqtts" : "mqtt",
  };
}

function publishAsync(client, topic, payload, options = {}) {
  return new Promise((resolve, reject) => {
    client.publish(topic, payload, options, (error) => error ? reject(error) : resolve());
  });
}

function connectAsync(client) {
  return new Promise((resolve, reject) => {
    const onConnect = () => { cleanup(); resolve(); };
    const onError = (error) => { cleanup(); reject(error); };
    const cleanup = () => {
      client.off("connect", onConnect);
      client.off("error", onError);
    };
    client.once("connect", onConnect);
    client.once("error", onError);
  });
}

export function buildMqttPayloads(data, checkedAt, now = new Date(checkedAt)) {
  const orders = buildWeekOrders(data.weeks[0]);
  const ordersThisWeek = buildWeekOrders(data.thisWeek);
  const deadlines = buildDeadlines(data, now);
  return {
    state: {
      last_checked: checkedAt,
      balance: data.balance,
      this_week_ordered_days: ordersThisWeek.ordered_days,
      next_week_ordered_days: orders.ordered_days,
      next_deadline: deadlines.next_deadline,
    },
    attributes: {
      orders,
      orders_this_week: ordersThisWeek,
      deadlines,
    },
  };
}

export class MqttPublisher {
  constructor(config) {
    this.config = config;
    this.client = null;
  }

  async connect() {
    if (!this.config.enabled) return;
    const discovered = this.config.host ? null : await supervisorMqttConfig();
    const connection = discovered || {
      host: this.config.host,
      port: this.config.port,
      username: this.config.username,
      password: this.config.password,
      protocol: "mqtt",
    };
    if (!connection.host) throw new Error("MQTT ist aktiviert, aber kein Broker wurde gefunden.");
    const statusTopic = `${this.config.baseTopic}/availability`;
    this.client = mqtt.connect(`${connection.protocol}://${connection.host}:${connection.port}`, {
      username: connection.username || undefined,
      password: connection.password || undefined,
      reconnectPeriod: 5_000,
      will: { topic: statusTopic, payload: "offline", qos: 1, retain: true },
    });
    await connectAsync(this.client);
    await this.publishDiscovery();
    await publishAsync(this.client, statusTopic, "online", { qos: 1, retain: true });
  }

  async publishDiscovery() {
    const prefix = this.config.discoveryPrefix;
    const base = this.config.baseTopic;
    const stateTopic = `${base}/state`;
    const healthTopic = `${base}/health`;
    const availabilityTopic = `${base}/availability`;
    const device = { identifiers: ["cateringexpert_monitor"], name: "Cateringexpert", manufacturer: "Cateringexpert (inoffiziell)", model: "Cateringexpert Monitor" };
    const common = { availability_topic: availabilityTopic, payload_available: "online", payload_not_available: "offline", device };
    const entities = [
      ["binary_sensor", "portal_connection", { name: "Portal-Verbindung", unique_id: "cateringexpert_portal_connection", state_topic: healthTopic, value_template: "{{ 'ON' if value_json.portal_ok else 'OFF' }}", payload_on: "ON", payload_off: "OFF", device_class: "connectivity", json_attributes_topic: healthTopic }],
      ["sensor", "balance", { name: "Guthaben", unique_id: "cateringexpert_balance", state_topic: stateTopic, value_template: "{{ value_json.balance }}", device_class: "monetary", unit_of_measurement: "EUR", suggested_display_precision: 2, icon: "mdi:wallet" }],
      ["sensor", "this_week_orders", { name: "Bestellungen diese Woche", unique_id: "cateringexpert_this_week_orders", state_topic: stateTopic, value_template: "{{ value_json.this_week_ordered_days }}", unit_of_measurement: "Tage", icon: "mdi:food-outline", json_attributes_topic: `${base}/attributes/orders_this_week` }],
      ["sensor", "next_week_orders", { name: "Bestellungen nächste Woche", unique_id: "cateringexpert_next_week_orders", state_topic: stateTopic, value_template: "{{ value_json.next_week_ordered_days }}", unit_of_measurement: "Tage", icon: "mdi:food", json_attributes_topic: `${base}/attributes/orders` }],
      ["sensor", "next_deadline", { name: "Nächste Bestellfrist", unique_id: "cateringexpert_next_deadline", state_topic: stateTopic, value_template: "{{ value_json.next_deadline }}", device_class: "timestamp", icon: "mdi:calendar-clock", json_attributes_topic: `${base}/attributes/deadlines` }],
      ["sensor", "last_update", { name: "Letzter Abruf", unique_id: "cateringexpert_last_update", state_topic: stateTopic, value_template: "{{ value_json.last_checked }}", device_class: "timestamp", icon: "mdi:clock-check" }],
    ];
    await Promise.all(entities.map(([domain, objectId, definition]) => publishAsync(
      this.client,
      `${prefix}/${domain}/cateringexpert/${objectId}/config`,
      JSON.stringify({ ...common, ...definition }),
      { qos: 1, retain: true },
    )));
  }

  async publishSnapshot(data, checkedAt) {
    if (!this.client) return;
    const payloads = buildMqttPayloads(data, checkedAt);
    await Promise.all([
      publishAsync(this.client, `${this.config.baseTopic}/state`, JSON.stringify(payloads.state), { qos: 1, retain: true }),
      ...Object.entries(payloads.attributes).map(([name, payload]) => publishAsync(this.client, `${this.config.baseTopic}/attributes/${name}`, JSON.stringify(payload), { qos: 1, retain: true })),
      publishAsync(this.client, `${this.config.baseTopic}/health`, JSON.stringify({ portal_ok: true, last_checked: checkedAt, error_type: null }), { qos: 1, retain: true }),
    ]);
  }

  async publishFailure(checkedAt, { type = "unknown" } = {}) {
    if (!this.client) return;
    await publishAsync(this.client, `${this.config.baseTopic}/health`, JSON.stringify({
      portal_ok: false,
      last_checked: checkedAt,
      error_type: type,
    }), { qos: 1, retain: true });
  }

  async close() {
    if (!this.client) return;
    await publishAsync(this.client, `${this.config.baseTopic}/availability`, "offline", { qos: 1, retain: true });
    await new Promise((resolve) => this.client.end(false, resolve));
  }
}
