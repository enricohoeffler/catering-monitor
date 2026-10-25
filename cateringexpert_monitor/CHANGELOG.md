# Changelog

## 0.1.0

- Erste Version: Bestellungen der nächsten Woche, Guthaben und Bestellfristen der kommenden Wochen per MQTT Discovery.
- Read-only-Allowlist: nur Anmeldung und vier lesende Endpunkte erlaubt.
- Fristberechnung nach den Einrichtungseinstellungen (wöchentliche oder tägliche Frist, optional ohne Wochenende), sommerzeitfest in Europe/Berlin.
- Einmalige Neuanmeldung bei abgelaufener Sitzung; letzter gültiger Datenstand bleibt bei Fehlern erhalten.
