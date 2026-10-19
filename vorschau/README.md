# Dashboard Vorschau

Dasselbe Dashboard wie im Ordner darüber, nur ohne App-Symbole: Jede Kachel zeigt die **App selbst**, verkleinert
und lebendig, mit ihren echten Daten. Ein Tipp zieht sie auf volle Größe, dort lässt sie sich ganz normal benutzen.
Zurück macht sie wieder klein.

Reines HTML, CSS und JavaScript, kein Build, keine Abhängigkeiten. Läuft offline, solange auch die Apps selbst
offline bereitliegen.

## Was anders ist als im Dashboard

- **Kachel = Live-Vorschau.** Jede App läuft in einem iframe in voller Handygröße und wird auf Kachelgröße
  verkleinert. Das Symbol (Emoji, Buchstabe, Bild) steht nur da, bis die App gezeichnet hat, oder wenn sie nicht
  erreichbar ist.
- **Tipp = groß.** Dasselbe iframe zieht sich auf den Bildschirm, ohne neu zu laden. Oben sitzt eine schmale Leiste
  in den Farben der App:
  - **⌄** macht die App wieder klein.
  - **⟳** lädt sie neu.
  - **↗** öffnet sie als installierte App in ihrem eigenen Fenster, mit derselben Öffnungsmethode wie im Dashboard.
- **Zurück** wirkt in der großen App wie in der App selbst: Sheet zu, zurück zur Übersicht, Buch schließen usw.
  Erst wenn die App fragen würde, ob sie schließen soll, wird sie stattdessen klein.
- **Kachelgröße** heißt hier Spaltenzahl am Handy: Kompakt 4, Normal 3, Groß 2. „Rund“ heißt bei den
  Hochformat-Vorschauen: stark gerundete Ecken.
- **Apps übernehmen:** Läuft das Dashboard auf demselben Gerät, bietet die leere Vorschau an, seine Apps zu
  übernehmen (auch unter Einstellungen → Backup). Backup-Dateien des Dashboards lassen sich ebenfalls importieren.
  Das Dashboard selbst wird dabei nur gelesen, nie verändert.
- Alles andere ist gleich: Hinzufügen, Bearbeiten (Stift oder lange drücken), Sortieren, Suche ab 8 Apps,
  Einstellungen, Testmodus der Öffnungsmethoden, Backup, Updates.

## Gut zu wissen

- **Dieselben Daten.** Vorschau und installierte App liegen auf derselben Adresse und teilen sich den Speicher.
  Was Du in der großen App hier änderst, ist auch in der installierten App geändert, und umgekehrt.
- **Eine App nicht an zwei Stellen gleichzeitig benutzen.** Deine Apps lesen ihre Daten nur beim Start. Läuft eine
  App noch im Hintergrund, während Du sie hier änderst, überschreibt sie die Änderung beim nächsten Speichern.
  Also die installierte App vorher schließen oder dort einmal neu starten. Umgekehrt passt die Vorschau auf:
  Ändert die installierte App etwas, lädt die Vorschau die Kachel neu. Ist die App hier gerade groß, steht oben
  „In einem anderen Fenster geändert · Neu laden“.
- Nach einem Update einer App kann ein einzelner Druck auf Zurück ohne Wirkung bleiben. Der nächste wirkt wieder
  (DECISIONS.md, 2).
- Jede Vorschau ist eine laufende App. Bei vielen Kacheln kostet das etwas Speicher und Akku. Kacheln weit unten
  laden erst beim Hinscrollen.
- Apps auf einer **anderen** Adresse (nicht `<name>.github.io`) erscheinen nur, wenn die Seite das Einbetten
  erlaubt, und dann nicht mit den Daten einer installierten App. Das Formular weist darauf hin.

## Hochladen

Die Vorschau liegt im Repo des Dashboards, im Unterordner `vorschau/`.

1. Im Repo `dashboard` auf GitHub: **Add file → Upload files**.
2. Den **Ordner** `vorschau` hineinziehen (diesmal den Ordner selbst, nicht seinen Inhalt). GitHub legt ihn als
   `vorschau/` an. `README.md` und `DECISIONS.md` dürfen mit, `icons/make-icons.py` und `icons/icon.svg` stören
   nicht.
3. Commit. Nach ein, zwei Minuten: `https://<name>.github.io/dashboard/vorschau/`

Bei jedem Update: `APP_VERSION` in `app.js` und `CACHE` in `sw.js` hochzählen und die geänderten Dateien plus
`sw.js` in `vorschau/` hochladen.

**Alternative:** Alle Pfade sind relativ. Der Inhalt des Ordners läuft unverändert auch als eigenes Repo,
z. B. `dashboard-vorschau`. Das wäre etwas sauberer: Unter `/dashboard/vorschau/` liegt die Vorschau im Bereich
(`scope`) des installierten Dashboards. Ein Link auf diese Adresse kann deshalb im Dashboard-Fenster landen statt
in der Vorschau. Startest Du die Vorschau über ihr eigenes Symbol auf dem Homescreen, spielt das keine Rolle.

## Installieren auf Android

Wie beim Dashboard, nur unter der Adresse oben: in Chrome öffnen, oben **Installieren** tippen (Chrome 154–157:
nicht das Chrome-Menü nehmen, siehe README des Dashboards). Auf dem Homescreen erscheint **Vorschau** mit einem
eigenen Symbol: ein Handy-Rahmen mit vier Fenstern. So lässt es sich nicht mit den vier Quadraten des Dashboards
verwechseln.

## Öffnungsmethoden, Checkliste, Paketname

Gilt hier für den Knopf ↗ in der großen App und steht ausführlich im README des Dashboards (`../README.md`).
Testmodus und Testergebnisse funktionieren genauso.

## Entwicklung

- Lokal muss der Server **den Ordner über allen Apps** ausliefern, sonst gibt es keine Vorschauen derselben
  Herkunft: `python3 -m http.server 8124` in `~/dev/pwa` (Eintrag „vorschau“ in `../.claude/launch.json`), dann
  `http://localhost:8124/dashboard/vorschau/`. Die Apps liegen dort unter `/habits/`, `/reader/` usw.
- Vor jedem Neuladen Service Worker und Caches leeren, sonst kommt die alte Fassung.
- Der Abschnitt „Öffnen“ (Intent-Links) ist wörtlich der des Dashboards. `node ../tests/launch-test.js` prüft den
  im Dashboard. Ändert sich dort etwas, den Abschnitt hierher übernehmen.
- Icons neu erzeugen: `python3 icons/make-icons.py` (braucht Pillow).
- Daten: `localStorage` unter `vorschau.v1`, dazu `vorschau.theme` und `vorschau.look`. `dashboard.v1` wird nur
  gelesen. Cache-Name `vorschau-…`: Das Dashboard löscht beim Aktualisieren alle Caches mit `dashboard-`.
