# Changelog

## 0.3.0

- Ferien und Schließtage werden berücksichtigt: Zeiträume aus dem Portal (`getVacationCustomer`, nur lesend) und optional aus einem Home-Assistant-Kalender (`holiday_calendar`, Standard `calendar.ferien_bayern_2`).
- Wochen, die vollständig in Ferien liegen, erhalten keine offene Bestellfrist mehr; die nächste Frist springt auf die nächste Schulwoche. Einzelne Ferientage verringern die bestellbaren Tage.
- Tage und Wochen tragen das Attribut `holiday`; der Fristsensor nennt die genutzten Ferienquellen.
- Die App liest den Kalender über die Supervisor-Core-API (`homeassistant_api: true`); fällt der Kalender aus, gelten weiter die Portalferien.

## 0.2.0

- Neuer Sensor „Bestellungen diese Woche“ für die laufende Kalenderwoche. Bisher fielen bestellte Essen ab Montag aus den Daten, weil nur die kommende Woche gelesen wurde.

## 0.1.0

- Erste Version: Bestellungen der nächsten Woche, Guthaben und Bestellfristen der kommenden Wochen per MQTT Discovery.
- Read-only-Allowlist: nur Anmeldung und vier lesende Endpunkte erlaubt.
- Fristberechnung nach den Einrichtungseinstellungen (wöchentliche oder tägliche Frist, optional ohne Wochenende), sommerzeitfest in Europe/Berlin.
- Einmalige Neuanmeldung bei abgelaufener Sitzung; letzter gültiger Datenstand bleibt bei Fehlern erhalten.
