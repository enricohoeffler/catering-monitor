# Cateringexpert Monitor – Home-Assistant-App-Repository

Dieses Repository stellt den **Cateringexpert Monitor** als Home-Assistant-App bereit. Die App liest aus dem Schulessen-Portal `essen.cateringexpert.de` rein lesend die aufgegebenen Bestellungen der nächsten Woche, das aktuelle Guthaben und die Bestellfristen der kommenden Wochen und veröffentlicht sie über MQTT Discovery in Home Assistant.

## Installation

1. In Home Assistant **Einstellungen → Apps → App-Store** öffnen.
2. Über das Menü **Repositories** auswählen.
3. Die URL dieses GitHub-Repositories hinzufügen.
4. Den App-Store neu laden und **Cateringexpert Monitor** installieren.

Die Portal-Zugangsdaten werden ausschließlich in der geschützten App-Konfiguration von Home Assistant hinterlegt. Es gehören keine Zugangsdaten in dieses Repository.

## Sicherheit und Datenschutz

- Es gibt keine offizielle API. Die App nutzt dieselben JSON-Endpunkte wie die Weboberfläche.
- Eine Allowlist erlaubt ausschließlich die Anmeldung und vier lesende Abrufe. Bestellen, Stornieren, Guthabenüberweisung und Auszahlung sind technisch blockiert.
- Von Kindern wird nur der Vorname an Home Assistant übertragen.

Der ausführbare App-Code liegt unter [`cateringexpert_monitor/`](cateringexpert_monitor/).
