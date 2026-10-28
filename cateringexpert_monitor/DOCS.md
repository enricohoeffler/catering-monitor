# Cateringexpert Monitor – Home-Assistant-App

Die App liest aus `essen.cateringexpert.de` die aufgegebenen Bestellungen der nächsten Woche, das aktuelle Guthaben und die Bestellfristen der kommenden Wochen und veröffentlicht daraus automatisch erkannte MQTT-Entitäten.

## Konfiguration

- `portal_base_url`: Normalerweise `https://essen.cateringexpert.de`.
- `email` / `password`: Cateringexpert-Zugang. Diese Werte nicht in Logs oder Support-Anfragen kopieren.
- `poll_interval_minutes`: Abrufintervall, mindestens 15 Minuten; empfohlen sind 120 Minuten.
- `holiday_calendar`: Optionale Kalenderentität mit Schulferien, Standard `calendar.ferien_bayern_2`; leer lassen, um nur die Portalferien zu verwenden.
- `weeks_ahead`: Anzahl der Bestellwochen ab nächster Woche, für die Fristen und Bestellstand ermittelt werden (Standard 3).
- `mqtt_discovery_prefix`: Normalerweise `homeassistant`.
- `mqtt_base_topic`: Normalerweise `cateringexpert`.

Die App bestellt, storniert und überweist nichts. Eine zentrale Allowlist lässt ausschließlich die Anmeldung und die Abrufe von Kindern, Einrichtungseinstellungen, Kundenkonto und Wochenbestellungen zu.

## Erzeugte Entitäten

- **Portal-Verbindung** (`binary_sensor.cateringexpert_portal_verbindung`)
- **Guthaben** (`sensor.cateringexpert_guthaben`) in EUR
- **Bestellungen diese Woche** (`sensor.cateringexpert_bestellungen_diese_woche`): wie unten, für die laufende Kalenderwoche
- **Bestellungen nächste Woche** (`sensor.cateringexpert_bestellungen_nachste_woche`): Anzahl bestellter Essenstage; Attribute mit Kalenderwoche, Gesamtpreis und je Kind den Tagen samt Menü
- **Nächste Bestellfrist** (`sensor.cateringexpert_nachste_bestellfrist`): Zeitpunkt der nächsten noch offenen Frist; Attribute mit Fristregel, bereits bestellten Tagen der betroffenen Woche und einer Liste der kommenden Wochen
- **Letzter Abruf** (`sensor.cateringexpert_letzter_abruf`)

Die Fristen werden aus den Einrichtungseinstellungen berechnet, so wie es auch die Weboberfläche tut. Ferien und Schließtage werden seit 0.3.0 berücksichtigt: aus den Ferienzeiten des Portals und optional aus dem Home-Assistant-Kalender in `holiday_calendar` (beide Quellen werden zusammengeführt). Liegt eine Woche vollständig in den Ferien, hat sie keine offene Frist; einzelne Ferientage verringern nur die bestellbaren Tage. Ein späterer Vertragsbeginn wird nicht berücksichtigt.

Bei Abruffehlern bleibt der letzte erfolgreiche Datenstand sichtbar. Die Entität **Portal-Verbindung** wechselt auf `Aus` und erhält im Attribut `error_type` eine der Klassen `authentication`, `network`, `portal`, `parser`, `policy` oder `unknown`.
