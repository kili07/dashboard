# Entscheidungen — Dashboard Vorschau

Stand 18.10.2026. Grundlage ist das Dashboard im Ordner darüber, kopiert am 18.10.2026 um 21:14, nachdem dessen
Nachtlauf fertig war. Bis zum Abschluss dieser Variante hat es sich nicht mehr geändert. Seine Entscheidungen
(`../DECISIONS.md`) und die Bauanleitung gelten hier weiter. Unten steht nur, was die Vorschau anders macht und
warum. **[A]** = Annahme, am Gerät zu bestätigen.

## 1. Was gegenüber dem Dashboard geändert ist

| Teil | Änderung |
|---|---|
| Kacheln | Statt Symbol ein iframe mit der App. Tipp macht sie groß statt sie per Link zu starten. |
| Rendern | Kacheln werden wiederverwendet statt per `innerHTML` neu gebaut. Neu bauen würde jedes iframe wegwerfen und alle Apps neu laden. Die Suche versteckt Kacheln nur. |
| Sortieren | Verschieben mit `moveBefore` (Chrome 133+), das iframes nicht neu lädt. Die Kopie unter dem Finger hat kein iframe. |
| Zurück | Neue Stufe „große App“ zwischen Sheet und Suche (siehe 2). |
| Öffnungsmethoden | Unverändert, gelten jetzt für ↗ in der großen App. Testmodus wie gehabt. |
| Daten | Eigene Schlüssel `vorschau.v1`, `.theme`, `.look`, sessionStorage `vorschau.*`. `dashboard.v1` wird nur gelesen (Apps übernehmen). |
| Backup | `meta.app` = „Dashboard Vorschau“. Der Import nimmt auch Backups des Dashboards (gleiches Format). |
| Cache | `vorschau-v1`. Das Dashboard löscht beim Aktivieren alle Caches mit `dashboard-`. |
| Service Worker | Wie der korrigierte des Dashboards: nur eigene Dateien, keine Startseite für fremde Unterordner. |
| Installation | Eigene PWA „Dashboard Vorschau“ / „Vorschau“, eigenes Icon (Handy mit vier Fenstern). |

## 2. Gleiche Herkunft: was im Browser belegt ist

Alle Apps liegen auf `<name>.github.io`, die Vorschauen sind also iframes **derselben Herkunft**. Das macht echte
Daten in den Vorschauen erst möglich, bringt aber drei Probleme. Getestet im eingebauten Browser (Chromium 152,
Handy-Ansicht 375 × 812) mit den echten Apps habits, reader, abirechner, Pokertracker und depottracker 2.0, lokal
unter einer gemeinsamen Adresse wie auf GitHub Pages.

**B1. Zurück-Wächter im iframe.** Jede App ruft beim Start `history.pushState` auf (Bauanleitung 5.7). Aus einem
iframe landet der Eintrag im gemeinsamen Verlauf des Fensters: Mit drei Vorschauen wuchs `history.length` um
zwei, je ein Eintrag pro geladener App. Zurück ging dann an eine unsichtbare App, die in ihrer Kachel „App
verlassen?“ öffnete.

**B2. Nachträglich abfangen geht nicht.** Ein `popstate`-Listener, den die Vorschau später am `window` des iframes
anhängt, läuft **nach** dem der App: Am `window` gilt die Reihenfolge der Anmeldung, auch für Capture-Listener.
Am Element wäre es umgekehrt (dort laufen Capture-Listener zuerst). Ausprobiert, die App öffnete ihr Sheet trotz
`stopImmediatePropagation`.

**B3. Eingriff vor dem Start klappt.** Wird `src` gesetzt, **bevor** das iframe ins Dokument kommt, gibt es kurz
ein leeres `about:blank`-Dokument. Navigiert das zu einer Seite derselben Herkunft, behält der Browser das
Window-Objekt (HTML-Standard: das erste `about:blank` wird wiederverwendet). Was die Vorschau in diesem Moment am
Window ändert, gilt für die App. Belegt: Markierung und geändertes `History.prototype.pushState` waren nach dem
Laden noch da, auch mit `loading="lazy"`. Ohne vorher gesetztes `src` (erst einhängen, dann `src`) ging es nicht.
Die Vorschau macht deshalb `pushState` zu `replaceState` (gleiche Wirkung auf URL und state, kein neuer Eintrag)
und merkt sich, wann die App speichert. Danach blieb `history.length` mit acht Vorschauen konstant.

**B4. Neu laden verliert den Eingriff.** Lädt sich eine App im iframe selbst neu (nach einem Update ruft sie
`location.reload()`), entsteht ein neues Window ohne Eingriff, und ihr Wächter hinterlässt einen Eintrag.
Die Vorschau bemerkt das am fehlenden Merkmal und ersetzt das iframe. Der Eintrag bleibt aber im Verlauf und
schluckt **einen** Druck auf Zurück ohne Wirkung. Danach räumt der nächste Wächter ihn ab. Gemessen:
9 → 10 Einträge, erster Druck ohne `popstate`, zweiter normal. Ihn per `history.back()` selbst abzuräumen,
habe ich bewusst gelassen: Liegt die Annahme am Handy daneben, würde das im schlimmsten Fall die App schließen.

**B5. Zurück in der großen App.** Statt die Logik der Apps nachzubauen, schickt die Vorschau der großen App ein
künstliches `popstate`. Die App reagiert mit ihrer eigenen Logik: habits springt auf „Heute“, der Reader schließt
das Buch, Poker die Kartenauswahl. Erscheint danach ein Sheet, das vorher nicht offen war, ist das „App
verlassen?“ (alle Deine Apps enden so). Die Vorschau schließt es sofort und macht die App klein. Ändert sich gar
nichts im DOM (App ohne Wächter, fremde Seite), wird sie ebenfalls klein. Gemessen:
Sheet offen → Zurück schließt es → Zurück macht klein → Zurück fragt „App verlassen?“, Verlauf konstant.

**B6. Fremde Änderungen erkennen.** Speichert die installierte App in einem anderen Fenster, bekommt die Vorschau
ein `storage`-Ereignis mit der Adresse der speichernden Seite (`/reader/`). Daran erkennt sie die App und lädt
nur deren Kachel neu. Der Ersatz lädt unsichtbar dahinter, nichts blinkt. Ist die App gerade groß, erscheint in
der Leiste „In einem anderen Fenster geändert · Neu laden“. Eigene Speichervorgänge der Vorschauen lösen nichts
aus: Sie sind am Merkmal aus B3 erkennbar, und es gab keinen Kreislauf beim Anlegen einer Gewohnheit in der
großen App.

**B7. `moveBefore`** gibt es in Chromium 152. Nach Ziehen, Umschalt+Pfeil, Liste/Raster und Kachelgröße liefen
alle Apps ohne Neuladen weiter (Markierung im Window der App blieb erhalten).

**B8. `inert`.** Ein inertes Elternelement lässt sich von innen nicht aufheben. Hätte die Vorschau beim Öffnen wie
bei Sheets `#main` gesperrt, wäre die große App tot gewesen (im Prototyp so gebaut und gefunden). Gesperrt
werden deshalb nur die Geschwister. Getestet mit echten Tipps und Tastatureingaben in der großen App.

## 3. Vermutet, nicht am Gerät geprüft

- **[A]** Chrome 155 auf Android verhält sich bei B1 bis B8 wie Chromium 152 am Desktop. Es ist dieselbe
  Engine, und nichts davon ist Android-spezifisch.
- **[A]** Bei der echten Zurück-Taste (Geste) wirkt Chromes Regel gegen „Verlaufs-Kapern“: Einträge ohne vorherige
  Berührung können übersprungen werden. Das gilt für die Wächter des Dashboards und Deiner Apps genauso. Weil die
  Vorschauen keine Einträge mehr anlegen (B3), kommt nichts Neues hinzu.
- **[A]** Speicher und Akku: Jede Vorschau ist eine laufende App. Bei Deinen schlanken Apps rechne ich mit
  10–30 MB je Kachel. Kacheln außer Sicht laden erst beim Hinscrollen (`loading="lazy"`).
- **[A]** Hält Chrome das Fenster im Hintergrund an, kommen `storage`-Ereignisse womöglich nicht an. Als Ersatz
  vergleicht die Vorschau beim Zurückkommen eine Prüfsumme über den Speicher und lädt bei Abweichung alle Kacheln
  neu. Was die Vorschauen selbst im Hintergrund speichern, wandert in die Vergleichsbasis: Der Reader sichert beim
  Wechsel in den Hintergrund seinen Lesestand, das wäre sonst ein Fehlalarm. Mit vorgetäuschtem Hintergrund
  geprüft: eigene Änderung übernommen, fremde erkannt.
- Liest Du in der großen App ein Buch und verkleinerst sie mit ⌄ statt mit Zurück, bleibt das Buch in der Kachel
  offen. Ist im Reader „Bildschirm anlassen“ eingeschaltet, bleibt der Bildschirm dann an, solange die Vorschau
  vorn ist. Der Reader gibt ihn nach zehn Minuten ohne Blättern selbst frei. Zurück schließt zuerst das Buch,
  dort tritt das nicht auf.
- **[A]** Tastatur in der großen App: Das Fenster schrumpft (`interactive-widget=resizes-content`), die Vorschau
  passt nur die große App an. In der Emulation kam ein `resize` nicht immer an, deshalb misst `openApp` zusätzlich.

## 4. Weitere Entscheidungen

- **Leiste statt Vollbild.** Die große App sitzt unter einer 48 px hohen Leiste mit ⌄, ⟳ und ↗. Ein schwebender
  Knopf hätte Bedienelemente der App verdeckt (alle haben oben rechts ihr Zahnrad). Die Leiste übernimmt
  Hintergrund- und `theme-color` der App, so wirkt sie wie ein Teil von ihr und zieht beim Theme-Wechsel der App
  mit.
- **Renderformat = Format der großen App.** Jede App rendert immer in der Größe, die sie geöffnet hat: Breite
  der Bühne, höchstens 480 px, Höhe ohne Leiste und sichere Ränder. Die Vorschau ist deshalb pixelgleich mit
  der großen App, und das Aufziehen ist reines Skalieren ohne Umbruch. Am Desktop bleibt sie handybreit, Deine
  Apps sind ohnehin für 560 px gebaut.
- **Kachelgröße als Spaltenzahl.** Kompakt/Normal/Groß = Mindestbreite 76/100/150 px, am Handy 4/3/2 Spalten.
- **Vorschau in sich selbst.** Steckt die Vorschau in einem iframe (als eigene Kachel), zeigt sie nur Symbole,
  sonst lüde sie sich endlos ineinander. Das Formular sagt das.
- **Fremde Adressen** werden versucht, aber das Formular warnt: Einbetten kann verboten sein, und die Daten
  sind dort nicht die der installierten App (getrennter Speicher fremder Herkunft).
- **Offline/Fehler.** Lädt eine App nicht (Fehlerseite, erkennbar am fremden Origin des iframe-Dokuments), zeigt
  die Kachel ihr Symbol mit „nicht erreichbar“ und versucht es bei `online` und beim Antippen erneut.
- **Unterordner statt Geschwister-Ordner.** Gewünscht war ein Unterordner des Projekts. Die bauende Sitzung des
  Dashboards hat darauf hingewiesen, dass `/dashboard/vorschau/` im Scope des Dashboards liegt. Deshalb steht im
  README die Alternative „eigenes Repo“, das geht ohne Codeänderung.

## 5. Offen, außerhalb dieses Ordners

- Zu `../OFFEN.md`: Auch **depottracker 2.0** löscht beim Aktivieren alle fremden Caches
  (`keys.filter((k) => k !== CACHE)`), nicht nur habits, abirechner und Pokertracker. Das trifft auch den Cache
  der Vorschau.
- **Daten in zwei Fenstern.** Deine Apps lesen ihre Daten nur beim Start. Eine App, die als installierte App im
  Hintergrund liegt, überschreibt beim nächsten Speichern, was in der Vorschau geändert wurde. Die Vorschau kann
  das nicht verhindern. Abhilfe in den Apps selbst wäre klein: bei `storage` für den eigenen Schlüssel neu laden,
  z. B. `addEventListener('storage', (e) => { if (e.key === KEY) location.reload(); })`.
