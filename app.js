'use strict';

/* ═══════════════════════════════════════════════════════════════
   Dashboard — Startseite für selbstgebaute Web-Apps

   Zwei Ansichten, oben umschaltbar: „Symbole“ (jede Kachel ist ein Link,
   der die installierte App startet) und „Vorschau“ (jede Kachel zeigt die
   App selbst, ein Tipp zieht sie groß). Die Vorschau steht im gleichnamigen
   Abschnitt und in DECISIONS.md, Abschnitt 4.

   Abschnitte (in dieser Reihenfolge):
   Konstanten · Datenmodell · Persistenz · Aussehen · Helfer · Öffnen ·
   Kacheln · Vorschau · Sortieren · Hinweise · Formular · Testmodus ·
   Einstellungen · Backup · Updates · Installieren · Sheet · Dialoge ·
   Zurück-Taste · Verdrahtung · Start
   ═══════════════════════════════════════════════════════════════ */

const KEY = 'dashboard.v1';
/* Format des Datensatzes. Bei jeder Strukturänderung hochzählen und in
   migrate() einen Schritt ergänzen — Backups tragen diese Nummer mit. */
const SCHEMA = 1;
/* Bei jeder Änderung hochzählen — wird in den Einstellungen angezeigt, damit
   sich auf dem Handy prüfen lässt, welche Fassung wirklich läuft. */
const APP_VERSION = '1.1.0';

/* Spiegel für das Startskript in index.html: ohne sie flackert beim Start das
   Theme und die Kacheln springen in ihre Größe. */
const THEME_KEY = 'dashboard.theme';
const LOOK_KEY = 'dashboard.look';

/* `bar` ist die Hintergrundfarbe des Themes und landet im
   <meta name="theme-color">, damit die Systemleiste des Handys mitzieht —
   muss mit --bg in style.css übereinstimmen. */
const THEMES = {
  light: { label: 'Hell',   bar: '#f5f6f8' },
  dark:  { label: 'Dunkel', bar: '#0b0e14' },
};

/* Vorgaben für Kachel- und Akzentfarben. Es sind Daten, keine Theme-Farben:
   eine Kachel behält ihre Farbe in hell und dunkel, wie ein App-Symbol.
   Graphit ist das Grau der eigenen App-Icons (Bauanleitung 5.14). */
const TILE_COLORS = [
  ['#1b1b1b', 'Graphit'], ['#4f5bd5', 'Indigo'], ['#2f7fd8', 'Blau'], ['#0f978a', 'Petrol'],
  ['#2e9e5b', 'Grün'], ['#d08a17', 'Bernstein'], ['#d9534f', 'Rot'], ['#c2457e', 'Rosa'],
  ['#7b5cd6', 'Violett'], ['#5b6472', 'Schiefer'],
];
const ACCENTS = [
  ['#4f5bd5', 'Indigo'], ['#2f7fd8', 'Blau'], ['#0f978a', 'Petrol'], ['#2e9e5b', 'Grün'],
  ['#d08a17', 'Bernstein'], ['#d9534f', 'Rot'], ['#c2457e', 'Rosa'], ['#5b6472', 'Schiefer'],
];

const SEARCH_MIN = 8;        // ab so vielen Kacheln erscheint die Suche
const NAME_MAX = 40;
const LONG_PRESS_MS = 500;   // ein normaler Tipp dauert unter 200 ms

const IS_ANDROID = /Android/i.test(navigator.userAgent);

/* ── Datenmodell ────────────────────────────────────────────── */

/** Frische Grundstruktur. Basis beim Laden und beim Backup-Import, damit
    später ergänzte Felder in alten Daten nicht fehlen. */
const blank = () => ({
  v: SCHEMA,
  apps: [],              // Kacheln in Anzeigereihenfolge, siehe blankApp()
  title: 'Meine Apps',   // Überschrift oben
  theme: 'auto',         // 'auto' | 'light' | 'dark'
  accent: '#4f5bd5',     // Akzentfarbe (Hex)
  view: 'icons',         // Ansicht 'icons' (Symbole, Tipp startet die App) | 'preview' (Live-Vorschau)
  layout: 'grid',        // 'grid' | 'list'
  size: 'm',             // Kachelgröße 's' | 'm' | 'l'
  shape: 'rounded',      // Kachelform 'square' | 'rounded' | 'round'
  labels: 'on',          // Namen unter den Kacheln (nur Raster) 'on' | 'off'
  font: 'm',             // Schriftgröße 's' | 'm' | 'l'
  method: 'auto',        // Standard-Öffnungsmethode für Apps mit method 'default'
  lastBackup: null,      // ISO-Zeit des letzten Exports
});

const blankApp = () => ({
  id: uid(),
  name: '',              // Anzeigename
  url: '',               // vollständige Adresse mit https://
  icon: '',              // Emoji oder 1–2 Zeichen; leer = Anfangsbuchstabe des Namens
  iconUrl: '',           // optionales Bild (nur http/https), sonst Symbol auf Farbe
  color: TILE_COLORS[0][0],
  method: 'default',     // 'default' (= globale Einstellung) oder ein Schlüssel aus METHODS
  pkg: '',               // Android-Paketname der WebAPK (org.chromium.webapk.…)
  tests: {},             // Testergebnisse je Methode: { pkg: { r: 'ok'|'browser'|'none', d: ISO } }
});

let db = blank();

/* ── Persistenz ─────────────────────────────────────────────── */

const HEX_RE = /^#[0-9a-f]{6}$/i;
const pick = (v, allowed, def) => (allowed.includes(v) ? v : def);
const plain = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? o : {});
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Älteres Format schrittweise auf SCHEMA heben. Jeder Schritt bekommt einen
    eigenen if-Block, damit ein Backup aus Fassung 1 auch dann noch lädt, wenn
    es längst Fassung 4 gibt. */
function migrate(d) {
  let v = Number.isInteger(d.v) ? d.v : 0;
  // 0 → 1: Datensätze ohne Versionsfeld (etwa von Hand gebaut) haben schon die Felder von 1.
  if (v < 1) v = 1;
  // Nächste Strukturänderung: SCHEMA auf 2 und hier `if (v < 2) { …umbauen…; v = 2; }`.
  d.v = v;
  return d;
}

/** Fremden Datensatz (aus localStorage oder Backup) auf die aktuelle Struktur
    bringen. Object.assign allein reicht nicht: Kacheln sind verschachtelte
    Objekte, jede wird einzeln auf ihre Vorgaben gebracht. Daten haben Vorrang
    vor Vorgabe; Unbekanntes bleibt erhalten, falls eine neuere Fassung es
    geschrieben hat. */
function normalize(src) {
  const base = blank();
  const s = plain(src);
  // Version aus der Quelle, nicht aus blank(): sonst sähe ein Datensatz ohne Versionsfeld aus wie der aktuelle
  const d = migrate(Object.assign(blank(), s, { v: Number.isInteger(s.v) ? s.v : 0 }));
  delete d.meta;                                   // Kopfdaten des Backups gehören nicht in die Daten

  d.title = str(d.title, NAME_MAX) || base.title;
  d.theme = pick(d.theme, ['auto', 'light', 'dark'], base.theme);
  d.accent = HEX_RE.test(d.accent) ? d.accent.toLowerCase() : base.accent;
  d.view = pick(d.view, ['icons', 'preview'], base.view);
  d.layout = pick(d.layout, ['grid', 'list'], base.layout);
  d.size = pick(d.size, ['s', 'm', 'l'], base.size);
  d.shape = pick(d.shape, ['square', 'rounded', 'round'], base.shape);
  if (typeof d.labels === 'boolean') d.labels = d.labels ? 'on' : 'off';
  d.labels = pick(d.labels, ['on', 'off'], base.labels);
  d.font = pick(d.font, ['s', 'm', 'l'], base.font);
  d.method = METHODS[d.method] ? d.method : base.method;
  d.lastBackup = typeof d.lastBackup === 'string' && !isNaN(Date.parse(d.lastBackup)) ? d.lastBackup : null;

  const seen = new Set();
  d.apps = (Array.isArray(d.apps) ? d.apps : []).map((a) => normApp(a, seen)).filter(Boolean);
  return d;
}

/** Eine Kachel auf Vorgaben bringen. Ohne gültige Adresse ist sie nutzlos und
    fällt weg — das zählt der Import und meldet es. */
function normApp(src, seen) {
  if (!src || typeof src !== 'object') return null;
  const url = checkUrl(src.url);
  if (!url.ok) return null;
  const a = Object.assign(blankApp(), src);
  if (typeof a.id !== 'string' || !a.id || seen.has(a.id)) a.id = uid();
  seen.add(a.id);
  a.url = url.href;
  a.name = str(a.name, NAME_MAX) || nameFromUrl(a.url);
  a.icon = str(a.icon, 32);
  if (graphemes(a.icon).length > 2) a.icon = graphemes(a.icon).slice(0, 2).join('');
  const iu = a.iconUrl ? checkUrl(a.iconUrl) : null;
  a.iconUrl = iu && iu.ok ? iu.href : '';
  a.color = HEX_RE.test(a.color) ? a.color.toLowerCase() : TILE_COLORS[0][0];
  a.method = a.method === 'default' || METHODS[a.method] ? a.method : 'default';
  a.pkg = typeof a.pkg === 'string' && PKG_RE.test(a.pkg.trim()) ? a.pkg.trim() : '';
  const t = plain(a.tests);
  a.tests = {};
  for (const m of Object.keys(METHODS)) {
    const r = plain(t[m]);
    if (TEST_RESULTS[r.r]) a.tests[m] = { r: r.r, d: typeof r.d === 'string' ? r.d.slice(0, 30) : '' };
  }
  return a;
}

/* Läuft die App ohne nutzbaren Speicher (privater Modus, gesperrt, voll),
   arbeitet sie im Arbeitsspeicher weiter und sagt das deutlich. */
let memOnly = false;
let loadFailed = false;    // gespeicherter Datensatz war unlesbar und liegt unter KEY + '.defekt'

function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); }
  catch (e) { memOnly = true; console.warn('localStorage gesperrt', e); return; }
  if (!raw) return;
  try { db = normalize(JSON.parse(raw)); }
  catch (e) {
    /* Kaputter Datensatz: nicht überschreiben, sondern beiseitelegen — vielleicht
       lässt er sich von Hand retten. Danach startet die App leer. */
    console.warn('Laden fehlgeschlagen', e);
    loadFailed = true;
    try { localStorage.setItem(KEY + '.defekt', raw); } catch (e2) { /* egal */ }
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
    if (memOnly) { memOnly = false; renderNotices(); }
  } catch (e) {
    console.error(e);
    if (!memOnly) { memOnly = true; renderNotices(); toast('Speichern fehlgeschlagen — nur bis zum Schließen gültig'); }
  }
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ── Aussehen ───────────────────────────────────────────────── */

const lightMq = matchMedia('(prefers-color-scheme: light)');
const effectiveTheme = () => (db.theme === 'auto' ? (lightMq.matches ? 'light' : 'dark') : db.theme);

/** Alle Einstellungen zur Darstellung aufs Dokument legen. Die Spiegel in
    THEME_KEY und LOOK_KEY liest das Startskript in index.html. */
function applyLook() {
  const root = document.documentElement;
  const t = effectiveTheme();
  root.dataset.theme = t;
  root.dataset.view = previewMode() ? 'preview' : 'icons';
  root.dataset.layout = db.layout;
  root.dataset.size = db.size;
  root.dataset.shape = db.shape;
  root.dataset.labels = db.labels;
  root.dataset.font = db.font;
  const onAccent = onColor(db.accent);
  root.style.setProperty('--accent', db.accent);
  root.style.setProperty('--on-accent', onAccent);
  const meta = $('meta[name="theme-color"]');
  // Ist eine App groß, färbt sie die Systemleiste; die Farbe des Dashboards kommt beim Schließen zurück
  if (opened) barBefore = THEMES[t].bar;
  else if (meta) meta.content = THEMES[t].bar;
  try {
    localStorage.setItem(THEME_KEY, db.theme);
    localStorage.setItem(LOOK_KEY, JSON.stringify({
      view: db.view, layout: db.layout, size: db.size, shape: db.shape, labels: db.labels, font: db.font,
      accent: db.accent, onAccent,
    }));
  } catch (e) { /* nicht schlimm: dann flackert nur der nächste Start */ }
}

/* ── Helfer ─────────────────────────────────────────────────── */

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* Zeichen so zählen, wie man sie sieht: 👍🏽 oder 🇩🇪 sind ein Zeichen, aber
   mehrere UTF-16-Einheiten. */
const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter
  ? new Intl.Segmenter('de', { granularity: 'grapheme' }) : null;
const graphemes = (s) => (segmenter ? Array.from(segmenter.segment(s), (x) => x.segment) : Array.from(s));
const isEmoji = (s) => /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(s);

/** Was auf der Kachel steht: das eigene Symbol oder der Anfangsbuchstabe. */
function glyph(a) {
  const g = graphemes(a.icon.trim());
  if (g.length) return g.slice(0, 2).join('');
  const n = graphemes(a.name.trim());
  return n.length ? n[0].toLocaleUpperCase('de-DE') : '?';
}
const glyphClass = (g) => (isEmoji(g) ? 'emoji' : graphemes(g).length > 1 ? 'two' : '');

/** Relative Helligkeit nach WCAG. */
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** Schwarz oder Weiß, je nachdem, was auf der Farbe den höheren Kontrast hat.
    Die Farben sind Daten (vom Nutzer gewählt), deshalb wird hier gerechnet
    statt ein Token zu nehmen. */
function onColor(hex) {
  const l = luminance(hex);
  return (l + 0.05) / 0.05 >= 1.05 / (l + 0.05) ? '#111111' : '#ffffff';
}

/** Zeichen auf einer Kachel: Weiß, solange es 3:1 erreicht — so viel verlangt
    WCAG für große, fette Schrift, und das Zeichen ist mindestens 22 px fett.
    Sonst kippten mittlere Farben (Grün, Rot) auf Schwarz und das Raster
    wirkte unruhig. Der Name steht ohnehin als Text daneben. */
function onTile(hex) {
  return 1.05 / (luminance(hex) + 0.05) >= 3 ? '#ffffff' : '#111111';
}

/** Eingegebene Adresse prüfen und vervollständigen. Fehlt das Protokoll, wird
    https:// ergänzt — so tippt man Adressen am Handy. „localhost:8123“ ist
    dabei kein Protokoll, sondern Host und Port. */
function checkUrl(raw) {
  let s = String(raw == null ? '' : raw).trim();
  if (!s) return { ok: false, err: 'Bitte eine Adresse eingeben.' };
  if (s.startsWith('//')) s = 'https:' + s;
  else if (!/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(s)) s = 'https://' + s;
  let u;
  try { u = new URL(s); } catch (e) { return { ok: false, err: 'Das sieht nicht nach einer gültigen Adresse aus.' }; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    return { ok: false, err: 'Nur Adressen mit https:// oder http:// sind möglich.' };
  }
  // Chrome macht aus „exa mple.com“ still „exa%20mple.com“ — deshalb den Host selbst prüfen
  if (/\s/.test(s)) return { ok: false, err: 'Die Adresse darf keine Leerzeichen enthalten.' };
  const h = u.hostname;
  if (!/^(\[[0-9a-f:.]+\]|[a-z0-9-]+(\.[a-z0-9-]+)*\.?)$/i.test(h)) {
    return { ok: false, err: 'Das sieht nicht nach einer gültigen Adresse aus.' };
  }
  if (!h.includes('.') && h !== 'localhost' && !h.startsWith('[')) {
    return { ok: false, err: 'Die Adresse braucht eine Domain, z. B. name.github.io/app/.' };
  }
  return { ok: true, href: u.href };
}

/** Endet der Pfad auf einen Ordnernamen ohne „/“? Dann liegt die Adresse
    vermutlich außerhalb des Scopes der Ziel-App: GitHub Pages leitet …/reader
    zwar auf …/reader/ weiter, der Intent-Filter der installierten App passt
    aber nur auf den Pfad mit Schrägstrich (DECISIONS.md, V2). */
function missingSlash(href) {
  const p = new URL(href).pathname;
  const last = p.split('/').pop();
  return p !== '/' && last !== '' && !last.includes('.');
}

/** Name aus der Adresse ableiten: …/reader/ → „Reader“. */
function nameFromUrl(href) {
  const u = new URL(href);
  const segs = u.pathname.split('/').filter(Boolean);
  let n = segs.length ? segs[segs.length - 1].replace(/\.[a-z0-9]+$/i, '') : u.hostname.split('.')[0];
  try { n = decodeURIComponent(n); } catch (e) { /* bleibt roh */ }
  n = n.replace(/[-_]+/g, ' ').trim();
  return (n.charAt(0).toLocaleUpperCase('de-DE') + n.slice(1)).slice(0, NAME_MAX) || u.hostname;
}

/** Kurzform der Adresse für Listen: ohne https:// und ohne „/“ am Ende. */
const shortUrl = (href) => href.replace(/^https?:\/\//, '').replace(/\/$/, '');

let toastTimer;
function toast(msg, ms) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), ms || 2400);
}

function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* egal */ } }

const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

const ICON_PEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>';
const ICON_PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
const ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const ICON_DROP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5c3 3.6 6 6.9 6 10.5a6 6 0 0 1-12 0c0-3.6 3-6.9 6-10.5z"/></svg>';

/* ── Öffnen ─────────────────────────────────────────────────────
   Wie ein Tipp auf eine Kachel die installierte Ziel-App erreichen soll.
   Hintergrund und Quellen: DECISIONS.md, Abschnitt 2. Kurz:
   - Chrome 155 startet eine nicht verifizierte WebAPK bei einem normalen Link
     nur, wenn Android ihr die Domain freigegeben hat — und auf
     <name>.github.io kann das nur eine App sein.
   - Ein intent://-Link MIT Paketname umgeht diese Prüfung: Android sucht dann
     nur in diesem Paket. Das ist der aussichtsreichste Weg.
   Dieser Abschnitt enthält nur reine Funktionen ohne DOM und ohne Zustand;
   tests/launch-test.js lädt genau ihn und prüft ihn mit Node. */

const METHODS = {
  auto: { label: 'Automatisch', long: 'Automatisch (Intent ohne Paket)',
    desc: 'Android sucht die passende App. Klappt nur, wenn sie die Links der Domain übernehmen darf.' },
  pkg:  { label: 'Intent mit Paket', long: 'Intent mit Paket',
    desc: 'Startet genau die installierte App. Braucht ihren Android-Paketnamen.' },
  same: { label: 'Link, gleiches Fenster', long: 'Link, gleiches Fenster',
    desc: 'Normaler Link. Öffnet meist im Dashboard-Fenster mit Adressleiste.' },
  tab:  { label: 'Link, neuer Tab', long: 'Link, neuer Tab',
    desc: 'Normaler Link in einem neuen Tab. Öffnet meist Chrome.' },
};

const TEST_RESULTS = {
  ok:      'öffnet die App',
  browser: 'öffnet Browser',
  none:    'nichts passiert',
};

/* Paketnamen von Chrome-WebAPKs sehen aus wie org.chromium.webapk.a1b2c3d4_v2.
   Erlaubt ist jeder gültige Android-Paketname — andere Browser benennen anders. */
const PKG_RE = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;

/** intent://-Adresse für Chrome auf Android.
    Aufbau: intent://HOST/PFAD?QUERY#FRAGMENT#Intent;scheme=…;…;end
    Android sucht den Intent-Teil mit lastIndexOf('#'), ein Fragment in der
    Zieladresse stört also nicht. Werte im Intent-Teil werden von Android
    prozent-dekodiert; encodeURIComponent maskiert dabei auch ; und #, die den
    Intent-Teil sonst zerschneiden würden. */
function intentUrl(href, pkg) {
  const u = new URL(href);
  let s = 'intent://' + u.host + u.pathname + u.search + u.hash
    + '#Intent;scheme=' + u.protocol.slice(0, -1)
    + ';action=android.intent.action.VIEW;';
  if (pkg) s += 'package=' + pkg + ';';
  return s + 'S.browser_fallback_url=' + encodeURIComponent(href) + ';end';
}

/** Welche Methode gilt für diese App wirklich? „Intent mit Paket“ ohne
    gültigen Paketnamen ist ein Intent ohne Paket. */
function effectiveMethod(app, globalMethod) {
  let m = app.method === 'default' ? globalMethod : app.method;
  if (!METHODS[m]) m = 'auto';
  if (m === 'pkg' && !PKG_RE.test(app.pkg || '')) m = 'auto';
  return m;
}

/** Link-Ziel für eine Methode: { href, blank }. `blank` heißt target="_blank".
    Außerhalb von Android gibt es keine intent://-Links; dort öffnen die
    Intent-Methoden die Adresse in einem neuen Tab. */
function launchTarget(url, method, pkg, android) {
  if (!android && (method === 'auto' || method === 'pkg')) return { href: url, blank: true };
  if (method === 'pkg' && PKG_RE.test(pkg || '')) return { href: intentUrl(url, pkg), blank: false };
  if (method === 'pkg' || method === 'auto') return { href: intentUrl(url, ''), blank: false };
  if (method === 'tab') return { href: url, blank: true };
  return { href: url, blank: false };
}

/* ── Kacheln ────────────────────────────────────────────────── */

let editing = false;         // Bearbeitungsmodus: Kacheln sind Knöpfe, Ziehen sortiert
let query = '';              // Suchbegriff

const ICON_VIEW_ICONS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8"/></svg>';
const ICON_VIEW_PREVIEW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="3" width="7.5" height="18" rx="2"/><rect x="13" y="3" width="7.5" height="18" rx="2"/><path d="M6 7h2.5M15.5 7h2.5"/></svg>';

/** Symbol einer Kachel. Bilder anderer Apps nur im <img>; schlägt das Laden
    fehl, ersetzt onImgError() es durch das Zeichen (data-g) auf der Farbe. */
function iconHtml(a) {
  const g = glyph(a);
  const gc = glyphClass(g);
  const style = `--c:${a.color};--on:${onTile(a.color)}`;
  if (a.iconUrl) {
    return `<span class="tile-ic" style="${style}" data-g="${esc(g)}" data-gc="${gc}" aria-hidden="true">`
      + `<img src="${esc(a.iconUrl)}" alt="" loading="lazy" decoding="async" draggable="false" referrerpolicy="no-referrer"></span>`;
  }
  return `<span class="tile-ic ${gc}" style="${style}" aria-hidden="true">${esc(g)}</span>`;
}

/** Kachel der Ansicht „Symbole“: ein echter Link, damit der Tipp als
    Benutzergeste zählt (DECISIONS.md 2, B7). */
function tileHtml(a) {
  const text = `<span class="tile-text"><span class="tile-name">${esc(a.name)}</span>`
    + `<span class="tile-sub">${esc(shortUrl(a.url))}</span></span>`;
  if (editing) {
    return `<button type="button" class="tile" data-id="${esc(a.id)}" aria-label="${esc(a.name)} bearbeiten" aria-describedby="editHelp">`
      + `<span class="tile-box">${iconHtml(a)}<span class="tile-badge" aria-hidden="true">${ICON_PEN}</span></span>${text}</button>`;
  }
  const t = launchTarget(a.url, effectiveMethod(a, db.method), a.pkg, IS_ANDROID);
  return `<a class="tile" href="${esc(t.href)}"${t.blank ? ' target="_blank" rel="noopener"' : ''}`
    + ` data-id="${esc(a.id)}" draggable="false" aria-label="${esc(a.name)}">`
    + `<span class="tile-box">${iconHtml(a)}</span>${text}</a>`;
}

/** Suchbegriff passt? Ohne Rücksicht auf Groß/klein und Akzente. */
const fold = (s) => s.toLocaleLowerCase('de-DE').normalize('NFD').replace(/\p{M}/gu, '');
const matches = (a, q) => fold(a.name + ' ' + shortUrl(a.url)).includes(q);

/** Kopf und Kacheln nachziehen. Die beiden Ansichten bauen ihre Kacheln
    verschieden: „Symbole“ zeichnet alles neu, „Vorschau“ verwendet sie
    wieder (siehe newTile). Beim Wechsel der Ansicht wird das Raster deshalb
    einmal geleert — das wirft auch alle Vorschauen weg und gibt ihren
    Speicher frei. */
function render() {
  $('#title').textContent = db.title;
  document.title = db.title;

  const showSearch = !editing && db.apps.length >= SEARCH_MIN;
  if (!showSearch && query) { query = ''; $('#search').value = ''; }
  $('#searchWrap').classList.toggle('hidden', !showSearch);
  $('#editHelp').classList.toggle('hidden', !editing || !db.apps.length);
  $('#btnEdit').classList.toggle('hidden', editing || !db.apps.length);
  $('#btnDone').classList.toggle('hidden', !editing);
  // Ansicht umschalten: der Knopf zeigt, wohin es geht. Beim Bearbeiten weg, sonst wird der Titel zu knapp
  const bv = $('#btnView');
  bv.classList.toggle('hidden', editing || !db.apps.length || IN_FRAME);
  if (bv.dataset.view !== db.view) {
    bv.dataset.view = db.view;
    bv.innerHTML = db.view === 'preview' ? ICON_VIEW_ICONS : ICON_VIEW_PREVIEW;
    bv.setAttribute('aria-label', db.view === 'preview' ? 'Symbole zeigen' : 'Live-Vorschau zeigen');
    bv.title = bv.getAttribute('aria-label');
  }
  // Backup fällig: ein Punkt am Zahnrad, mehr Aufdringlichkeit braucht es nicht
  $('#btnSettings').classList.toggle('badge', backupDue());
  $('#btnSettings').setAttribute('aria-label', backupDue() ? 'Einstellungen, Backup empfohlen' : 'Einstellungen');

  const grid = $('#grid');
  const view = previewMode() ? 'preview' : 'icons';
  if (grid.dataset.view !== view) {
    if (boxRO) boxRO.disconnect();
    grid.innerHTML = '';
    grid.dataset.view = view;
  }
  if (view === 'preview') renderPreviews(grid); else renderIcons(grid);
}

const EMPTY_HTML = `<div class="empty">
  <p>Noch keine Apps. Füge Deine erste selbstgebaute App hinzu, sie erscheint dann hier als Kachel.</p>
  <button type="button" class="btn btn-primary" data-act="add">${ICON_PLUS} App hinzufügen</button>
</div>`;

const ADD_TILE_HTML = '<button type="button" class="tile tile-add" data-act="add">'
  + `<span class="tile-box"><span class="tile-ic" aria-hidden="true">${ICON_PLUS}</span></span>`
  + '<span class="tile-text"><span class="tile-name">Hinzufügen</span></span></button>';

/** Ansicht „Symbole“: alles neu zeichnen. Bei ein paar Dutzend Kacheln ist
    gezieltes Aktualisieren unnötige Komplexität — einmal neu rendern ist
    schnell genug und kann nicht aus dem Tritt geraten. */
function renderIcons(grid) {
  if (!db.apps.length) { grid.innerHTML = EMPTY_HTML; return; }
  const q = fold(query.trim());
  const list = q ? db.apps.filter((a) => matches(a, q)) : db.apps;
  grid.innerHTML = list.map(tileHtml).join('')
    + (editing ? ADD_TILE_HTML : '')
    + (q && !list.length ? `<p class="nothing">Nichts gefunden.</p>` : '');
}

/** Ansicht „Vorschau“: Kacheln wiederverwenden statt neu bauen — nur so
    bleiben die Vorschauen beim Sortieren, Suchen und Umstellen am Leben. */
function renderPreviews(grid) {
  // Leerzustand, „Hinzufügen“ und „Nichts gefunden“ sind keine Kacheln: die entstehen jedes Mal neu
  $$('#grid > :not(.tile[data-id])').forEach((n) => n.remove());
  const q = fold(query.trim());
  const have = new Map($$('#grid > .tile[data-id]').map((t) => [t.dataset.id, t]));
  let prev = null, shown = 0;
  for (const a of db.apps) {
    let t = have.get(a.id);
    if (t) have.delete(a.id); else t = newTile(a);
    updateTile(t, a);
    // Ausgefilterte Kacheln nur verstecken, damit ihre Vorschau weiterläuft
    const hit = !q || matches(a, q);
    t.classList.toggle('hidden', !hit);
    if (hit) shown++;
    const want = prev ? prev.nextSibling : grid.firstChild;
    if (t !== want) moveEl(grid, t, want);
    syncFrame(t, a);           // erst eingehängt: vorher hat ein iframe kein Window für den Eingriff
    prev = t;
  }
  have.forEach(dropTile);

  if (!db.apps.length) { grid.insertAdjacentHTML('beforeend', EMPTY_HTML); return; }
  grid.insertAdjacentHTML('beforeend', (editing ? ADD_TILE_HTML : '')
    + (q && !shown ? '<p class="nothing">Nichts gefunden.</p>' : ''));
  scaleTiles();
}

/** Kachel der Vorschau anlegen. Sie bleibt danach bestehen, solange es die
    App gibt: renderPreviews() zieht nur Text und Symbol nach und schiebt sie
    an ihren Platz. Neu zeichnen per innerHTML wie bei den Symbolen geht hier
    nicht — dabei flöge jedes iframe raus, und alle Apps würden neu geladen.
    Aufbau: tile-box trägt Symbol (Platzhalter, solange die App lädt) und
    iframe; tile-hit liegt als Knopf über allem und nimmt Tipps an — das
    iframe selbst ist in der Kachel unbedienbar (pointer-events:none). */
function newTile(a) {
  const t = document.createElement('div');
  t.className = 'tile';
  t.dataset.id = a.id;
  t.innerHTML = '<span class="tile-box"><span class="tile-ic"></span></span>'
    + '<span class="tile-text"><span class="tile-name"></span><span class="tile-sub"></span></span>'
    + '<button type="button" class="tile-hit"></button>';
  if (boxRO) boxRO.observe($('.tile-box', t));
  return t;
}

/** Text, Symbol und Bearbeiten-Zustand einer bestehenden Kachel nachziehen. */
function updateTile(t, a) {
  const ic = iconHtml(a);
  // outerHTML ersetzt nur das Symbol, das iframe daneben bleibt unberührt
  if (t.dataset.ic !== ic) { $('.tile-ic', t).outerHTML = ic; t.dataset.ic = ic; }
  $('.tile-name', t).textContent = a.name;
  $('.tile-sub', t).textContent = shortUrl(a.url);
  const hit = $('.tile-hit', t);
  hit.setAttribute('aria-label', editing ? `${a.name} bearbeiten` : `${a.name} groß öffnen`);
  if (editing) hit.setAttribute('aria-describedby', 'editHelp'); else hit.removeAttribute('aria-describedby');
  const badge = $('.tile-badge', t);
  if (editing && !badge) $('.tile-box', t).insertAdjacentHTML('beforeend', `<span class="tile-badge" aria-hidden="true">${ICON_PEN}</span>`);
  else if (!editing && badge) badge.remove();
}

function dropTile(t) {
  if (boxRO) boxRO.unobserve($('.tile-box', t));
  t.remove();
}

/** Element an seinen Platz schieben. moveBefore (Chrome 133+) verschiebt,
    ohne das iframe darin neu zu laden. insertBefore lädt es neu und bleibt
    nur der Ersatz für ältere Browser und für frisch angelegte Kacheln. */
function moveEl(parent, el, ref) {
  if (parent.moveBefore && el.isConnected) {
    try { parent.moveBefore(el, ref); return; } catch (e) { /* unten */ }
  }
  parent.insertBefore(el, ref);
}

/** Ansicht wechseln (Knopf oben, Einstellungen). */
function setView(v) {
  if (db.view === v) return;
  setLook('view', v);
  toast(v === 'preview' ? 'Live-Vorschau' : 'Symbole', 1400);
}

/** Ein Icon-Bild lädt nicht (offline, Adresse falsch): Zeichen auf Farbe. */
function onImgError(e) {
  const img = e.target;
  if (!(img instanceof HTMLImageElement)) return;
  const ic = img.closest('.tile-ic');
  if (!ic || ic.dataset.g == null) return;
  if (ic.dataset.gc) ic.classList.add(ic.dataset.gc);
  ic.textContent = ic.dataset.g;
}

function setEditing(on) {
  if (editing === on) return;
  editing = on;
  if (on) armBack();          // Zurück soll den Modus beenden, nicht die App
  render();
}

/** Kachel an eine neue Stelle setzen (Tastatur). */
function moveApp(id, dir) {
  const i = db.apps.findIndex((a) => a.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= db.apps.length) return;
  const [a] = db.apps.splice(i, 1);
  db.apps.splice(j, 0, a);
  save();
  render();
  const el = $(`#grid .tile[data-id="${CSS.escape(id)}"]`);
  // In der Vorschau trägt der Knopf über der Kachel den Fokus, bei den Symbolen die Kachel selbst
  if (el) ($('.tile-hit', el) || el).focus();
}

/* ── Vorschau ───────────────────────────────────────────────────
   Nur in der Ansicht „Vorschau“. Jede Kachel enthält die App selbst: ein
   iframe in voller Handygröße, per transform auf Kachelgröße verkleinert. Ein Tipp zieht genau dieses iframe
   auf die volle Fläche. Es wird dabei nicht neu geladen, die App steht also
   sofort da, mit ihrem Zustand.

   Heikel wird das, weil Deine Apps auf derselben Adresse liegen wie das
   Dashboard (gleicher Origin). Daraus folgen drei Dinge, ausprobiert in
   Chromium 152, Details in DECISIONS.md 4.2:

   1. Verlauf. Jede App legt beim Start einen Zurück-Wächter an
      (history.pushState). Aus einem iframe landet er im gemeinsamen Verlauf
      des Fensters, und Zurück ginge an eine unsichtbare App statt ans
      Dashboard. Deshalb wird pushState im iframe zu replaceState, noch bevor
      die App startet (patchFrame). Für die große App reicht das Dashboard
      Zurück an die App weiter (backInApp), damit sie wie gewohnt reagiert.
   2. Neu laden verliert den Eingriff. Lädt sich eine App selbst neu, etwa
      nach einem Update, läuft sie ohne ihn. onFrameLoad bemerkt das und
      ersetzt die Vorschau durch eine frische.
   3. Gemeinsamer Speicher. Die Vorschau liest dieselben Daten wie die
      installierte App. Ändert die installierte App etwas, ist die Vorschau
      veraltet — und würde beim Weiterbenutzen die Änderung überschreiben.
      Deshalb lädt die Vorschau betroffene Kacheln neu (storage-Ereignis,
      Rückkehr ins Fenster) und warnt in der großen App. */

const OPEN_MS = 280;         // Dauer des Aufziehens, wie --open-ms in style.css
const OWN_WRITE_MS = 2000;   // so lange gilt eine Speicheränderung als „von einer Vorschau hier“

/* Läuft das Dashboard selbst in einer Vorschau (als Kachel in sich selbst),
   zeigt es nur Symbole. Sonst lüde es sich endlos ineinander. */
const IN_FRAME = (() => { try { return window.top !== window.self; } catch (e) { return true; } })();
const previewMode = () => db.view === 'preview' && !IN_FRAME;

let frameW = 390, frameH = 760;   // so groß rendert jede App: genau die Größe, die sie geöffnet hat
let opened = null;                // { id, tile, frame } der gerade großen App
let patchWorks = false;           // hat der Eingriff vor dem Start schon einmal gegriffen? (siehe settleTile)

const sameOrigin = (href) => { try { return new URL(href).origin === location.origin; } catch (e) { return false; } };
const appById = (id) => db.apps.find((a) => a.id === id);
const tileById = (id) => $(`#grid .tile[data-id="${CSS.escape(id)}"]`);

/** Vor dem Start der App eingreifen. Ein iframe hat zuerst ein leeres
    about:blank-Dokument. Navigiert es von dort zu einer Seite desselben
    Origins, behält der Browser das Window-Objekt (HTML-Standard: „initial
    about:blank“ wird wiederverwendet) — was hier am Window geändert wird,
    gilt also auch für die App. Dafür muss src VOR dem Einhängen gesetzt sein
    (makeFrame). Bei fremdem Origin geht der Eingriff ohne Schaden ins Leere. */
function patchFrame(f) {
  let w;
  try { w = f.contentWindow; if (!w) return; w.__dashboard = true; } catch (e) { return; }
  try {
    const H = w.History.prototype;
    const replace = H.replaceState;
    // Gleiche Wirkung auf URL und state, nur ohne neuen Schritt im Verlauf
    H.pushState = function (state, title, url) { return replace.call(this, state, title, url); };
    // Merken, wann diese Vorschau selbst gespeichert hat (siehe fromOwnFrame und ownWrite)
    const S = w.Storage.prototype;
    ['setItem', 'removeItem', 'clear'].forEach((k) => {
      const orig = S[k];
      S[k] = function () {
        w.__wrote = Date.now();
        const r = orig.apply(this, arguments);
        ownWrite();
        return r;
      };
    });
  } catch (e) { /* dann eben ohne — onFrameLoad fängt den Rest */ }
}

function makeFrame(a) {
  const f = document.createElement('iframe');
  f.className = 'tile-frame';
  f.title = a.name;
  f.tabIndex = -1;
  f.inert = true;                      // in der Kachel weder Fokus noch Tipps
  f.setAttribute('aria-hidden', 'true');
  f.loading = 'lazy';                  // Kacheln weit unten laden erst beim Hinscrollen
  f.dataset.src = a.url;
  f.src = a.url;                       // vor dem Einhängen, sonst greift patchFrame nicht
  f.addEventListener('load', () => onFrameLoad(f));
  return f;
}

function addFrame(box, a, next) {
  const f = makeFrame(a);
  if (next) f.classList.add('next');   // Ersatz, der unsichtbar lädt und dann die alte ablöst
  box.insertBefore(f, $('.tile-badge', box));
  patchFrame(f);
  return f;
}

/** Hat die Kachel das richtige iframe? Neue Adresse: neues iframe. */
function syncFrame(tile, a) {
  const box = $('.tile-box', tile);
  const f = $('.tile-frame:not(.next)', box);
  if (f && f.dataset.src === a.url) { f.title = a.name; return; }
  if (f && opened && opened.frame === f) return;      // die große App nicht unter den Fingern austauschen
  $$('.tile-frame', box).forEach((x) => x.remove());
  tile.classList.remove('live', 'failed');
  addFrame(box, a, false);
}

/** Wie ist das iframe geladen? live = App läuft mit Eingriff, raw = ohne
    (hat sich selbst neu geladen), failed = Fehlerseite (offline, Server weg),
    blank = noch das leere Anfangsdokument. */
function frameState(f) {
  if (!sameOrigin(f.dataset.src)) return 'live';       // fremde Seite: nicht einsehbar, so nehmen wie sie ist
  let d = null;
  try { d = f.contentDocument; } catch (e) { /* null */ }
  if (!d) return 'failed';                             // Chromes Fehlerseiten haben einen fremden Origin
  if (d.URL === 'about:blank') return 'blank';
  try { if (f.contentWindow.__dashboard) { patchWorks = true; return 'live'; } } catch (e) { return 'failed'; }
  return 'raw';
}

function onFrameLoad(f) {
  const tile = f.closest('.tile');
  if (!tile) return;
  const st = frameState(f);
  if (st === 'blank') return;
  f.dataset.state = st;
  if (f.classList.contains('next')) return;            // der Ersatz meldet sich in refreshTile
  settleTile(tile, f, st);
}

function settleTile(tile, f, st) {
  tile.classList.toggle('failed', st === 'failed');
  tile.classList.toggle('live', st !== 'failed');
  if (st === 'raw') {
    /* Ohne Eingriff hat die App einen Eintrag im Verlauf hinterlassen und hört
       selbst auf Zurück. Eine frische Vorschau ist wieder gezähmt. Nur wenn der
       Eingriff in diesem Browser überhaupt greift (patchWorks) — sonst würde
       endlos neu geladen — und nicht bei der großen App, die gerade benutzt wird. */
    if (patchWorks && !(opened && opened.frame === f) && !f.dataset.retried) refreshTile(tile, true);
    else patchLate(f);
    return;
  }
  if (st === 'live') hookFrame(f);
  if (opened && opened.frame === f) paintStage(f);
}

/** Eingriff nachholen, nachdem die App schon läuft: verhindert weitere
    Verlaufseinträge, den ersten vom Start nicht mehr. */
function patchLate(f) {
  try {
    const H = f.contentWindow.History.prototype;
    const replace = H.replaceState;
    H.pushState = function (s, t, u) { return replace.call(this, s, t, u); };
  } catch (e) { /* fremder Origin */ }
  hookFrame(f);
}

/** Escape in der großen App verkleinert sie — außer die App hat gerade ein
    eigenes Sheet offen, das gehört dann ihr. Capture am window läuft vor den
    Tasten-Handlern der App. Dazu: wechselt die App ihr Theme, zieht die
    Leiste der Bühne mit. */
function hookFrame(f) {
  try {
    const w = f.contentWindow;
    w.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !opened || opened.frame !== f || appSheetOpen(f)) return;
      e.preventDefault();
      closeApp();
    }, true);
    new w.MutationObserver(() => { if (opened && opened.frame === f) paintStage(f); })
      .observe(f.contentDocument.documentElement, { attributes: true, subtree: true, attributeFilter: ['data-theme', 'content'] });
  } catch (e) { /* fremder Origin */ }
}

/** Sheet der App offen? Alle Deine Apps folgen der Bauanleitung: #sheet ohne .hidden. */
function appSheetOpen(f) {
  try {
    const s = f.contentDocument.getElementById('sheet');
    return !!s && !s.classList.contains('hidden');
  } catch (e) { return false; }
}

/** Vorschau einer Kachel frisch laden. Der Ersatz lädt unsichtbar hinter der
    alten und löst sie erst ab, wenn er steht — so blinkt nichts. */
function refreshTile(tile, retried) {
  const box = $('.tile-box', tile);
  const a = appById(tile.dataset.id);
  if (!box || !a || !previewMode() || $('.tile-frame.next', box)) return;
  const old = $('.tile-frame:not(.next)', box);
  const f = addFrame(box, a, true);
  if (retried) f.dataset.retried = '1';
  const giveUp = setTimeout(() => f.remove(), 20000);  // lädt nicht (offline): alte Vorschau behalten
  f.addEventListener('load', () => {
    const st = f.dataset.state;
    if (!st) return;                                   // erst das leere Anfangsdokument
    clearTimeout(giveUp);
    if (st === 'failed' && old && !tile.classList.contains('failed')) { f.remove(); return; }
    if (old && opened && opened.frame === old) { f.remove(); showStale(true); return; }
    if (old) old.remove();
    f.classList.remove('next');
    settleTile(tile, f, st);
  });
}

/** Alle Vorschauen frisch laden (Einstellungen). */
function refreshAll() {
  $$('#grid .tile[data-id]').forEach((t) => { if (!opened || opened.tile !== t) refreshTile(t); });
}

/** Wo die große App sitzt: der Platzhalter in der Bühne. */
function stageRect() {
  const r = $('#stageSlot').getBoundingClientRect();
  return { left: r.left, top: r.top, width: Math.round(r.width), height: Math.round(r.height) };
}

/* Maßstab je Kachel: Kachelbreite geteilt durch Renderbreite. Der Observer
   hält ihn aktuell, wenn Raster, Größe oder Fenster sich ändern. */
const boxRO = typeof ResizeObserver === 'function' ? new ResizeObserver((entries) => {
  for (const en of entries) if (en.contentRect.width) en.target.style.setProperty('--s', (en.contentRect.width / frameW).toFixed(4));
}) : null;

/** Dasselbe von Hand, gleich nach dem Rendern — der Observer meldet sich
    erst beim nächsten Bild, bis dahin stünden neue Kacheln falsch. */
function scaleTiles() {
  $$('#grid .tile-box').forEach((b) => { if (b.clientWidth) b.style.setProperty('--s', (b.clientWidth / frameW).toFixed(4)); });
}

/** Renderformat aus der Bühne übernehmen. Nicht, solange eine App groß ist:
    öffnet dort die Tastatur, schrumpft das Fenster, und alle Kacheln würden
    umgebaut. */
function measureFrames() {
  if (opened) return;
  const r = stageRect();
  if (r.width < 200 || r.height < 200 || (r.width === frameW && r.height === frameH)) return;
  frameW = r.width; frameH = r.height;
  const st = document.documentElement.style;
  st.setProperty('--fwn', frameW);
  st.setProperty('--fhn', frameH);
  scaleTiles();
}

/** CSS-Farbe → #rrggbb, durchsichtig → null. */
function rgbToHex(c) {
  const m = String(c).match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+%?))?/);
  if (!m || (m[4] !== undefined && parseFloat(m[4]) === 0)) return null;
  return '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('');
}

let barBefore = null;        // theme-color des Dashboards, solange eine App sie färbt

/** Bühne in den Farben der App: Leiste wie ihr Hintergrund, Systemleiste wie
    ihre theme-color. So wirkt die große App wie gestartet, nicht eingebettet. */
function paintStage(f) {
  let bg = null, bar = null;
  try {
    const d = f.contentDocument;
    bg = rgbToHex(getComputedStyle(d.body).backgroundColor) || rgbToHex(getComputedStyle(d.documentElement).backgroundColor);
    const meta = d.querySelector('meta[name="theme-color"]');
    bar = (meta && HEX_RE.test(meta.content) && meta.content) || bg;
  } catch (e) { /* fremder Origin: Farben des Dashboards */ }
  const st = $('#stage').style;
  if (bg) { st.setProperty('--stage-bg', bg); st.setProperty('--stage-fg', onColor(bg)); }
  else { st.removeProperty('--stage-bg'); st.removeProperty('--stage-fg'); }
  const meta = $('meta[name="theme-color"]');
  if (meta && bar) { if (barBefore === null) barBefore = meta.content; meta.content = bar; }
}

function fillStage(a, f) {
  $('#stageName').textContent = a.name;
  const t = launchTarget(a.url, effectiveMethod(a, db.method), a.pkg, IS_ANDROID);
  const l = $('#stageLaunch');
  l.href = t.href;
  if (t.blank) { l.target = '_blank'; l.rel = 'noopener'; } else { l.removeAttribute('target'); l.removeAttribute('rel'); }
  l.setAttribute('aria-label', `${a.name} als installierte App öffnen`);
  showStale(false);
  paintStage(f);
}

/** Alles außer der großen App für Tastatur und Screenreader sperren. Nicht
    #main im Ganzen: das iframe steckt darin, und inert lässt sich von innen
    nicht aufheben — die App wäre tot. */
function lockBackground(tile) {
  const on = !!tile;
  $('#topbar').inert = on;
  $$('#main > :not(#grid)').forEach((n) => { n.inert = on; });
  $$('#grid > *').forEach((n) => { n.inert = on && n !== tile; });
  if (tile) { $('.tile-hit', tile).inert = on; $('.tile-text', tile).inert = on; }
  else $$('#grid .tile-hit, #grid .tile-text').forEach((n) => { n.inert = false; });
}

/** App groß machen. FLIP: das iframe springt ohne Übergang an seine
    Endposition, bekommt per transform die Lage der Kachel und läuft dann
    zurück auf transform:none. Es wird nur verschoben und skaliert, nie
    umgehängt — umhängen würde es neu laden. */
function openApp(id) {
  if (opened) return;
  const a = appById(id);
  if (!a) return;
  const tile = tileById(id);
  const f = tile && $('.tile-frame:not(.next)', tile);
  if (!f) return;
  if (tile.classList.contains('failed')) refreshTile(tile);   // offline gewesen? Gleich noch einmal versuchen
  measureFrames();                                     // falls ein resize-Ereignis verloren ging (Drehen im Hintergrund)
  armBack();                                           // Zurück soll die App verkleinern, nicht die Vorschau schließen

  const boxEl = $('.tile-box', tile);
  const box = boxEl.getBoundingClientRect();
  const radius = parseFloat(getComputedStyle(boxEl).borderTopLeftRadius) || 0;
  opened = { id, tile, frame: f };
  fillStage(a, f);
  document.documentElement.classList.add('app-open');
  $('#stage').removeAttribute('aria-hidden');
  lockBackground(tile);
  tile.classList.add('is-open');

  const to = stageRect();
  const s = box.width / to.width;
  f.classList.add('open');
  Object.assign(f.style, {
    left: to.left + 'px', top: to.top + 'px', width: to.width + 'px', height: to.height + 'px',
    transform: `translate(${box.left - to.left}px, ${box.top - to.top}px) scale(${s})`,
    borderRadius: (radius / s) + 'px',
  });
  f.inert = false; f.removeAttribute('aria-hidden'); f.tabIndex = 0;
  void f.offsetWidth;                                  // Startlage festschreiben, sonst läuft kein Übergang
  f.classList.add('anim');
  f.style.transform = 'none';
  f.style.borderRadius = '0px';
  setTimeout(() => {
    if (!opened || opened.frame !== f) return;
    try { f.focus(); f.contentWindow.focus(); } catch (e) { /* egal */ }
  }, OPEN_MS);
}

/** Zurück in die Kachel, derselbe Weg rückwärts. */
function closeApp() {
  if (!opened) return;
  const { tile, frame: f } = opened;
  opened = null;
  const boxEl = $('.tile-box', tile);
  const box = boxEl.getBoundingClientRect();
  const radius = parseFloat(getComputedStyle(boxEl).borderTopLeftRadius) || 0;
  const L = parseFloat(f.style.left), T = parseFloat(f.style.top), W = parseFloat(f.style.width);
  const s = box.width ? box.width / W : 0.2;           // Kachel weggefiltert: einfach klein werden
  const hadFocus = document.activeElement === f;
  f.style.transform = box.width
    ? `translate(${box.left - L}px, ${box.top - T}px) scale(${s})`
    : `translate(${W * 0.4}px, 40px) scale(${s})`;
  f.style.borderRadius = (radius / s) + 'px';
  document.documentElement.classList.remove('app-open');
  $('#stage').setAttribute('aria-hidden', 'true');
  lockBackground(null);
  const meta = $('meta[name="theme-color"]');
  if (meta && barBefore !== null) meta.content = barBefore;
  barBefore = null;

  setTimeout(() => {
    f.classList.remove('open', 'anim');
    ['left', 'top', 'width', 'height', 'transform', 'borderRadius'].forEach((k) => { f.style[k] = ''; });
    f.inert = true; f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
    tile.classList.remove('is-open');
    measureFrames();                                   // Fenster hat sich derweil vielleicht gedreht
    if (tile.dataset.stale) { delete tile.dataset.stale; refreshTile(tile); }
    if (hadFocus || document.activeElement === document.body) $('.tile-hit', tile).focus({ preventScroll: true });
  }, OPEN_MS);
}

/** Zurück bei großer App. Die App bekommt ein popstate, als hätte sie es
    selbst empfangen, und reagiert mit ihrer eigenen Logik: Sheet zu, Tab
    „Übersicht“, Buch schließen … Am Ende fragt jede Deiner Apps „App
    verlassen?“ — dieses Sheet erscheint dann neu, wird gleich wieder
    zugemacht und die App stattdessen klein. Tut die App gar nichts (kein
    eigener Wächter, fremde Seite), wird sie ebenfalls klein. */
function backInApp() {
  const f = opened.frame;
  let w = null, d = null;
  try { w = f.contentWindow; d = f.contentDocument; } catch (e) { /* fremder Origin */ }
  if (!w || !d || !d.body) { closeApp(); return; }
  const hadSheet = appSheetOpen(f);
  const before = d.body.innerHTML;
  try { w.dispatchEvent(new w.PopStateEvent('popstate', { state: w.history.state })); }
  catch (e) { closeApp(); return; }
  if (!hadSheet && appSheetOpen(f)) {
    const c = d.getElementById('sheetCancel');
    if (c) c.click();
    closeApp();
    return;
  }
  if (d.body.innerHTML === before) closeApp();
}

/** Große App neu laden, ohne sie zu schließen: frisches iframe an dieselbe
    Stelle, das alte fliegt raus. location.reload() ginge nicht — ein neues
    Dokument im alten iframe liefe ohne Eingriff (patchFrame). */
function reloadOpen() {
  if (!opened) return;
  const { tile, frame: old } = opened;
  const a = appById(tile.dataset.id);
  const f = addFrame($('.tile-box', tile), a, false);
  ['left', 'top', 'width', 'height'].forEach((k) => { f.style[k] = old.style[k]; });
  f.style.transform = 'none';                          // sonst gälte der Maßstab der Kachel
  f.classList.add('open');
  f.inert = false; f.removeAttribute('aria-hidden'); f.tabIndex = 0;
  old.remove();
  opened.frame = f;
  delete tile.dataset.stale;
  showStale(false);
  f.addEventListener('load', () => {
    if (!opened || opened.frame !== f) return;
    try { f.focus(); } catch (e) { /* egal */ }
  }, { once: true });
}

/** In der Leiste statt des Namens: „In einem anderen Fenster geändert“. */
function showStale(on) {
  $('#stageNote').classList.toggle('hidden', !on);
  $('#stageName').classList.toggle('hidden', on);
}

/* ── Frische ────────────────────────────────────────────────────
   Wann ist eine Vorschau veraltet? Wenn jemand anderes ihre Daten geändert
   hat — meist die installierte App in ihrem eigenen Fenster. */

/** Welche Apps gehören zu einer Seitenadresse? storage-Ereignisse nennen die
    Adresse der Seite, die gespeichert hat. Passt sie in den Ordner einer App,
    ist es deren Änderung. Unbekannt → null = alle. */
function appsForUrl(url) {
  if (!url) return null;
  let u;
  try { u = new URL(url); } catch (e) { return null; }
  return db.apps.filter((a) => {
    try {
      const x = new URL(a.url);
      return x.origin === u.origin && u.pathname.startsWith(x.pathname.replace(/[^/]*$/, ''));
    } catch (e) { return false; }
  }).map((a) => a.id);
}

function markStale(ids) {
  for (const tile of $$('#grid .tile[data-id]')) {
    if (ids && !ids.includes(tile.dataset.id)) continue;
    if (opened && opened.tile === tile) { tile.dataset.stale = '1'; showStale(true); continue; }
    if (opened || document.hidden) { tile.dataset.stale = '1'; continue; }
    refreshTile(tile);
  }
}

function flushStale() {
  if (document.hidden || opened) return;
  $$('#grid .tile[data-stale]').forEach((tile) => { delete tile.dataset.stale; refreshTile(tile); });
}

/** Hat gerade eine Vorschau hier selbst gespeichert? Dann ist die Änderung
    nicht fremd — sonst lüde eine App, die beim Start speichert, sich und
    die anderen im Kreis neu. */
function fromOwnFrame() {
  const now = Date.now();
  return $$('#grid .tile-frame').some((f) => {
    try { return now - (f.contentWindow.__wrote || 0) < OWN_WRITE_MS; } catch (e) { return false; }
  });
}

/** Prüfsumme über den Speicher aller Apps. Liegt das Fenster im Hintergrund,
    stellt Chrome es unter Umständen still, und storage-Ereignisse kommen
    nicht an. Beim Zurückkommen zeigt der Vergleich, ob sich etwas getan hat. */
function storePrint() {
  let h = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith('dashboard.')) continue;
      const s = k + '\u0000' + localStorage.getItem(k);
      for (let j = 0; j < s.length; j++) h = (h * 31 + s.charCodeAt(j)) | 0;
    }
  } catch (e) { return null; }
  return h;
}

let printHidden = null;

/** Eine Vorschau hat gespeichert. Liegt das Fenster im Hintergrund, gehört
    das in die Vergleichsbasis — der Reader etwa sichert beim Wechsel in den
    Hintergrund seinen Lesestand, und das ist keine fremde Änderung. */
function ownWrite() {
  if (document.hidden && printHidden !== null) printHidden = storePrint();
}

function wirePreviews() {
  $('#stageClose').onclick = closeApp;
  $('#stageReload').onclick = reloadOpen;
  $('#stageNote').onclick = reloadOpen;
  // Nach dem Antippen öffnet der Link die installierte App, hier wird sie wieder klein
  $('#stageLaunch').addEventListener('click', () => setTimeout(closeApp, 0));
  if (IN_FRAME) return;

  window.addEventListener('storage', (e) => {
    if (!previewMode()) return;
    if (e.storageArea && e.storageArea !== localStorage) return;
    if (e.key && e.key.startsWith('dashboard.')) return;
    if (fromOwnFrame()) return;
    markStale(appsForUrl(e.url));
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { printHidden = previewMode() ? storePrint() : null; return; }
    const p = storePrint();
    if (printHidden !== null && p !== printHidden && !fromOwnFrame()) markStale(null);
    printHidden = null;
    flushStale();
  });
  window.addEventListener('online', () => $$('#grid .tile.failed').forEach((t) => refreshTile(t)));
  window.addEventListener('resize', () => {
    if (!opened) { measureFrames(); return; }
    // Tastatur in der großen App: nur sie anpassen, die Kacheln bleiben, wie sie sind
    const r = stageRect();
    Object.assign(opened.frame.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
  });
}

/* ── Sortieren ──────────────────────────────────────────────────
   Nur im Bearbeitungsmodus, damit Ziehen nicht mit dem Öffnen kollidiert.
   Pointer Events für Maus und Finger. Auf Touch gilt: kurz halten, dann
   ziehen — wer sofort wischt, scrollt die Seite wie gewohnt. Während des
   Ziehens bleibt die Kachel als blasser Platzhalter im Raster und wandert
   dorthin, wo sie landen wird; eine Kopie folgt dem Finger. */

const DRAG_HOLD_MS = 220;
let drag = null;             // { el, id, pid, x0, y0, armed, active, timer, ghost, lx, ly, scroll }
let dragEndedAt = 0;         // der Klick direkt nach dem Loslassen darf nicht das Formular öffnen

function wireDrag() {
  const grid = $('#grid');
  grid.addEventListener('pointerdown', (e) => {
    if (!editing || drag || e.button > 0 || query) return;
    const el = e.target.closest('.tile[data-id]');
    if (!el) return;
    drag = { el, id: el.dataset.id, pid: e.pointerId, x0: e.clientX, y0: e.clientY,
      armed: e.pointerType === 'mouse', active: false, timer: 0 };
    if (!drag.armed) {
      drag.timer = setTimeout(() => {
        if (!drag || drag.active) return;
        drag.armed = true;
        el.classList.add('lift');
        buzz(10);
      }, DRAG_HOLD_MS);
    }
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    const dist = Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0);
    if (!drag.active) {
      if (!drag.armed) { if (dist > 8) endDrag(false); return; }   // vor dem Halten bewegt: das ist Scrollen
      if (dist < 6) return;
      beginDrag();
    }
    moveDrag(e.clientX, e.clientY);
  });
  /* Während des Ziehens darf die Seite nicht scrollen. Das geht nur mit einem
     nicht-passiven touchmove: touch-action lässt sich nach Beginn der
     Berührung nicht mehr umstellen. */
  grid.addEventListener('touchmove', (e) => { if (drag && drag.armed) e.preventDefault(); }, { passive: false });
  window.addEventListener('pointerup', (e) => { if (drag && e.pointerId === drag.pid) endDrag(true); });
  window.addEventListener('pointercancel', (e) => { if (drag && e.pointerId === drag.pid) endDrag(false); });
}

function beginDrag() {
  const d = drag;
  d.active = true;
  clearTimeout(d.timer);
  const r = d.el.getBoundingClientRect();
  const g = d.el.cloneNode(true);
  // Ohne iframe: eine Kopie davon würde die App ein zweites Mal laden. Die Kopie zeigt das Symbol.
  $$('iframe, .tile-hit', g).forEach((x) => x.remove());
  g.classList.remove('lift', 'live');
  g.classList.add('drag-ghost');
  g.removeAttribute('data-id');
  g.setAttribute('aria-hidden', 'true');
  Object.assign(g.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
  document.body.appendChild(g);
  d.ghost = g;
  d.el.classList.remove('lift');
  d.el.classList.add('ph');
  document.body.classList.add('dragging');
  d.scroll = setInterval(autoScroll, 16);
}

/** Kopie unter den Finger, Platzhalter an die Stelle der Kachel darunter.
    Entscheidend ist die Reihenfolge, nicht die Bildschirmhälfte: liegt die
    Zielkachel hinter dem Platzhalter, kommt er hinter sie, sonst davor. So
    pendelt nichts hin und her, wenn sich das Raster beim Umstellen verschiebt. */
function moveDrag(x, y) {
  const d = drag;
  d.lx = x; d.ly = y;
  d.ghost.style.transform = `translate(${x - d.x0}px, ${y - d.y0}px)`;
  const over = document.elementFromPoint(x, y);
  const t = over && over.closest('#grid .tile[data-id]');
  if (!t || t === d.el) return;
  const tiles = $$('#grid .tile[data-id]');
  const from = tiles.indexOf(d.el), to = tiles.indexOf(t);
  moveEl($('#grid'), d.el, to > from ? t.nextSibling : t);   // ohne eine Vorschau neu zu laden
}

/** Am oberen oder unteren Rand weiterrollen, damit lange Listen sortierbar sind. */
function autoScroll() {
  const d = drag;
  if (!d || !d.active || d.ly == null) return;
  const edge = 72, h = window.innerHeight;
  const dy = d.ly < edge ? -Math.ceil((edge - d.ly) / 5) : d.ly > h - edge ? Math.ceil((d.ly - h + edge) / 5) : 0;
  if (!dy) return;
  window.scrollBy(0, dy);
  // Die Kopie ist fixiert und bleibt unter dem Finger; neu bestimmt wird nur, worüber sie jetzt liegt
  moveDrag(d.lx, d.ly);
}

/** Loslassen (commit) oder Abbruch. Die neue Reihenfolge steht im DOM. */
function endDrag(commit) {
  const d = drag;
  drag = null;
  if (!d) return;
  clearTimeout(d.timer);
  clearInterval(d.scroll);
  d.el.classList.remove('lift', 'ph');
  document.body.classList.remove('dragging');
  if (d.ghost) d.ghost.remove();
  if (!d.active) return;
  dragEndedAt = Date.now();
  if (commit) {
    const order = $$('#grid .tile[data-id]').map((x) => x.dataset.id);
    const before = db.apps.map((a) => a.id).join();
    const pos = new Map(order.map((id, i) => [id, i]));
    db.apps.sort((a, b) => (pos.has(a.id) ? pos.get(a.id) : 1e9) - (pos.has(b.id) ? pos.get(b.id) : 1e9));
    if (db.apps.map((a) => a.id).join() !== before) save();
  }
  render();                    // auch beim Abbruch: alte Reihenfolge wiederherstellen
}

/* ── Hinweise ───────────────────────────────────────────────── */

const HINT_KEY = 'dashboard.nohint';   // sessionStorage: Installationshinweis für diese Sitzung weg

function renderNotices() {
  let hide = false;
  try { hide = sessionStorage.getItem(HINT_KEY) === '1'; } catch (e) { /* egal */ }
  const parts = [];
  if (loadFailed) {
    parts.push(`<div class="notice warn" role="alert"><div class="notice-t">
      <strong>Gespeicherte Daten waren nicht lesbar</strong>Sie liegen unverändert unter „${esc(KEY)}.defekt“.
      Ein Backup lädst Du in den Einstellungen über „Importieren“.</div>
      <button type="button" class="icon-btn" data-act="hide-loadfail" aria-label="Hinweis ausblenden">${ICON_X}</button></div>`);
  }
  if (memOnly) {
    parts.push(`<div class="notice warn" role="alert"><div class="notice-t">
      <strong>Speichern nicht möglich</strong>Änderungen gelten nur, bis die App geschlossen wird.
      Sichere sie in den Einstellungen per Export.</div></div>`);
  }
  if (!isStandalone() && !hide) {
    /* Der Knopf heißt immer „Installieren“: ob Chrome die Installation anbietet
       (beforeinstallprompt), zeigt sich oft erst Sekunden später — so springt
       nichts, wenn es kommt. Ohne Ereignis erklärt er den Weg übers Menü. */
    parts.push(`<div class="notice" id="installNotice"><div class="notice-t">
      <strong>Bitte zuerst installieren</strong>Erst dann öffnen sich Deine Apps im eigenen Fenster.</div>
      <button type="button" class="link strong" data-act="install">Installieren</button>
      <button type="button" class="icon-btn" data-act="hide-hint" aria-label="Hinweis ausblenden">${ICON_X}</button>
    </div>`);
  }
  $('#notices').innerHTML = parts.join('');
}

/* ── Formular: App anlegen und bearbeiten ───────────────────── */

let form = null;           // Arbeitskopie im offenen Formular; db bleibt bis „Sichern“ unberührt
let formIsNew = false;

function nextColor() {
  // Reihum durch die Vorgaben, damit neue Kacheln sich unterscheiden
  return TILE_COLORS[db.apps.length % TILE_COLORS.length][0];
}

function newApp() {
  form = Object.assign(blankApp(), { color: nextColor() });
  formIsNew = true;
  appSheet();
}

function editApp(id) {
  const a = db.apps.find((x) => x.id === id);
  if (!a) return;
  form = JSON.parse(JSON.stringify(a));
  formIsNew = false;
  appSheet();
}

/** Das Formular aus der Arbeitskopie zeichnen. Wird auch nach Unterdialogen
    (Paketname-Hilfe, Löschen-Rückfrage) wieder aufgerufen — deshalb steht
    alles Eingetippte vorher per syncForm() in `form`. */
function appSheet() {
  const f = form;
  const choice = (key, title, desc, tag) => `
    <label class="choice"><input type="radio" name="f_method" value="${key}"${f.method === key ? ' checked' : ''}>
      <span class="choice-t"><b>${esc(title)}${tag ? `<span class="tag">${esc(tag)}</span>` : ''}</b><small>${esc(desc)}</small></span></label>`;

  openSheet(formIsNew ? 'App hinzufügen' : 'App bearbeiten', `
    <div class="preview" id="f_preview"></div>

    <div class="fld">
      <label class="fld-l" for="f_url">Adresse</label>
      <input class="inp" id="f_url" type="url" inputmode="url" placeholder="name.github.io/app/"
        autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(f.url)}"
        aria-describedby="f_url_err f_url_hint">
      <p class="fld-err" id="f_url_err" aria-live="polite"></p>
      <p class="fld-hint" id="f_url_hint"></p>
    </div>
    <div class="fld">
      <label class="fld-l" for="f_name">Name</label>
      <input class="inp" id="f_name" maxlength="${NAME_MAX}" autocomplete="off" value="${esc(f.name)}"
        placeholder="wird aus der Adresse vorgeschlagen" aria-describedby="f_name_err">
      <p class="fld-err" id="f_name_err" aria-live="polite"></p>
    </div>

    <div class="fld" role="radiogroup" aria-labelledby="f_method_l">
      <span class="fld-l" id="f_method_l">Öffnen mit</span>
      <div class="choices">
        ${choice('default', `Standard (${METHODS[db.method].label})`, 'Wie in den Einstellungen festgelegt.')}
        ${Object.keys(METHODS).map((k) => choice(k, METHODS[k].long, METHODS[k].desc, k === 'pkg' ? 'empfohlen' : '')).join('')}
      </div>
      <p class="fld-hint" id="f_method_hint"></p>
    </div>
    <div class="fld">
      <label class="fld-l" for="f_pkg">Android-Paketname (für „Intent mit Paket“)</label>
      <input class="inp" id="f_pkg" placeholder="org.chromium.webapk.a1b2c3…" autocomplete="off"
        autocapitalize="off" spellcheck="false" value="${esc(f.pkg)}" aria-describedby="f_pkg_err f_pkg_hint">
      <p class="fld-err" id="f_pkg_err" aria-live="polite"></p>
      <p class="fld-hint" id="f_pkg_hint">Steht in Chrome unter <code>chrome://webapks</code>.
        <button type="button" class="link" data-f="pkghelp">So findest Du ihn</button></p>
    </div>

    <div class="fld">
      <label class="fld-l" for="f_icon">Symbol</label>
      <input class="inp" id="f_icon" autocomplete="off" value="${esc(f.icon)}"
        placeholder="Emoji oder 1–2 Zeichen, leer = Anfangsbuchstabe" aria-describedby="f_icon_err">
      <p class="fld-err" id="f_icon_err" aria-live="polite"></p>
    </div>
    <div class="fld">
      <span class="fld-l" id="f_color_l">Farbe</span>
      <div class="swatches" id="f_colors" role="radiogroup" aria-labelledby="f_color_l"></div>
    </div>
    <div class="fld">
      <label class="fld-l" for="f_iconurl">Bild statt Symbol (optional)</label>
      <input class="inp" id="f_iconurl" type="url" inputmode="url" autocomplete="off" autocapitalize="off"
        spellcheck="false" placeholder="Adresse eines Bildes" value="${esc(f.iconUrl)}" aria-describedby="f_iconurl_err f_iconurl_hint">
      <p class="fld-err" id="f_iconurl_err" aria-live="polite"></p>
      <p class="fld-hint" id="f_iconurl_hint"></p>
    </div>

    <div id="f_tests"></div>

    ${formIsNew ? '' : `<div class="form-foot">
      <button type="button" class="btn btn-ghost danger" data-f="delete">Löschen</button>
    </div>`}
  `, saveApp);

  renderColors();
  refreshForm();
  $('#sheetBody').onclick = onFormClick;
  $('#sheetBody').oninput = onFormInput;
  $('#sheetBody').onchange = onFormInput;
  $('#f_url').addEventListener('blur', () => {
    // Name aus der Adresse vorschlagen, solange keiner eingetragen ist
    const u = checkUrl($('#f_url').value);
    if (u.ok && !$('#f_name').value.trim()) { $('#f_name').value = nameFromUrl(u.href); syncForm(); refreshForm(); }
  });
  $$('#sheetBody .inp').forEach((inp) => {
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); saveApp(); } });
  });
}

function renderColors() {
  const f = form;
  const preset = TILE_COLORS.some(([c]) => c === f.color);
  $('#f_colors').innerHTML = TILE_COLORS.map(([c, n]) =>
    `<button type="button" role="radio" aria-checked="${f.color === c}" aria-label="${esc(n)}"
      class="${f.color === c ? 'on' : ''}" data-color="${c}" style="--sw:${c}"></button>`).join('')
    + `<label class="swatch-custom${preset ? '' : ' on'}" style="--sw:${esc(f.color)};--on:${onTile(f.color)}"
        title="Eigene Farbe">${ICON_DROP}<input type="color" id="f_color" value="${esc(f.color)}" aria-label="Eigene Farbe"></label>`;
}

/** Eingaben in die Arbeitskopie übernehmen, ohne zu prüfen. */
function syncForm() {
  if (!form || !$('#f_url')) return;
  form.url = $('#f_url').value.trim();
  form.name = $('#f_name').value.trim();
  form.icon = $('#f_icon').value.trim();
  form.iconUrl = $('#f_iconurl').value.trim();
  form.pkg = $('#f_pkg').value.trim();
  const m = $('#sheetBody input[name="f_method"]:checked');
  if (m) form.method = m.value;
}

/** Vorschau und Hinweise nachziehen — bei jeder Eingabe. Fehler erscheinen
    erst beim Sichern; hier nur Hinweise, die beim Tippen helfen. */
function refreshForm() {
  const f = form;
  const u = checkUrl(f.url);
  const shown = Object.assign({}, f, { name: f.name || (u.ok ? nameFromUrl(u.href) : ''), iconUrl: '' });
  $('#f_preview').innerHTML = iconHtml(shown)
    + `<div class="preview-t"><b>${esc(shown.name || 'Neue App')}</b>${esc(u.ok ? shortUrl(u.href) : 'Adresse fehlt noch')}</div>`;

  const hints = [];
  // Fehlender Schrägstrich: häufigster Grund, warum die installierte App den Link nicht fängt
  if (u.ok && missingSlash(u.href)) {
    hints.push(`Endet die Adresse der App auf „/“ (z. B. …/reader/)? Nur dann liegt sie im Bereich der
       installierten App. <button type="button" class="link" data-f="slash">„/“ ergänzen</button>`);
  }
  // Die Live-Vorschau zeigt nur Apps derselben Adresse zuverlässig, mit ihren echten Daten
  if (u.ok && db.view === 'preview') {
    if (sameOrigin(u.href) && new URL(u.href).pathname.startsWith(new URL('./', location.href).pathname)) {
      hints.push('Das ist das Dashboard selbst. In der Vorschau erscheint dann nur sein Symbol, sonst lüde es sich endlos ineinander.');
    } else if (!sameOrigin(u.href)) {
      hints.push(`Liegt nicht unter ${esc(location.host)}. Die Live-Vorschau zeigt die Seite nur, wenn sie das Einbetten
         erlaubt, und dann nicht mit den Daten Deiner installierten App.`);
    }
  }
  $('#f_url_hint').innerHTML = hints.join('<br>');

  const pkgOk = PKG_RE.test(f.pkg);
  let mh = '';
  if (f.method === 'pkg' && !pkgOk) mh = 'Ohne gültigen Paketnamen gilt „Automatisch“ (Intent ohne Paket).';
  else if (pkgOk && f.method !== 'pkg') {
    mh = 'Ein Paketname ist eingetragen. Am aussichtsreichsten ist „Intent mit Paket“. '
      + '<button type="button" class="link" data-f="usepkg">Verwenden</button>';
  }
  $('#f_method_hint').innerHTML = mh;
  $('#f_pkg_err').textContent = f.pkg && !pkgOk ? 'So sieht kein Paketname aus (Beispiel: org.chromium.webapk.a1b2c3).' : '';

  $('#f_iconurl_hint').innerHTML = u.ok && !f.iconUrl
    ? `Deine Apps haben ihr Icon meist unter icons/icon-192.png.
       <button type="button" class="link" data-f="appicon">Das verwenden</button>` : '';

  renderTests();
}

function onFormInput(e) {
  if (e.target.id === 'f_color') {
    /* Nicht neu zeichnen: der native Farbwähler ist noch offen und hängt an
       genau diesem <input>. Nur die Markierung umsetzen. */
    form.color = e.target.value.toLowerCase();
    markColor(form.color);
  }
  syncForm();
  refreshForm();
}

/** Auswahl in der Farbleiste umsetzen, ohne sie neu zu zeichnen. */
function markColor(c) {
  const preset = TILE_COLORS.some(([x]) => x === c);
  $$('#f_colors [data-color]').forEach((b) => {
    const on = b.dataset.color === c;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', String(on));
  });
  const cu = $('#f_colors .swatch-custom');
  cu.classList.toggle('on', !preset);
  cu.style.setProperty('--sw', c);
  cu.style.setProperty('--on', onTile(c));
}

function onFormClick(e) {
  const tb = e.target.closest('[data-test]');
  if (tb) { startTest(e, tb.dataset.test); return; }
  const ab = e.target.closest('[data-ask]');
  if (ab) { answerTest(ab.dataset.ask); return; }
  const c = e.target.closest('[data-color]');
  if (c) { form.color = c.dataset.color; markColor(form.color); $('#f_color').value = form.color; refreshForm(); return; }
  const b = e.target.closest('[data-f]');
  if (!b) return;
  syncForm();
  const act = b.dataset.f;
  if (act === 'slash') {
    const u = checkUrl(form.url);
    if (u.ok) { const x = new URL(u.href); x.pathname += '/'; $('#f_url').value = form.url = x.href; }
    refreshForm();
  } else if (act === 'usepkg') {
    form.method = 'pkg';
    $$('#sheetBody input[name="f_method"]').forEach((r) => { r.checked = r.value === 'pkg'; });
    refreshForm();
  } else if (act === 'appicon') {
    const u = checkUrl(form.url);
    if (u.ok) { $('#f_iconurl').value = form.iconUrl = new URL('icons/icon-192.png', u.href).href; }
    refreshForm();
  } else if (act === 'pkghelp') {
    pkgHelpSheet(appSheet);
  } else if (act === 'delete') {
    const id = form.id;
    askSheet(`„${form.name || 'App'}“ löschen?`,
      'Die Kachel verschwindet aus dem Dashboard. Die installierte App selbst bleibt unberührt.',
      'Löschen', () => {
        db.apps = db.apps.filter((a) => a.id !== id);
        save(); closeSheet(); render(); toast('Gelöscht');
      }, appSheet, true);
  }
}

/** Prüfen und Fehler am Feld anzeigen. Gibt das erste fehlerhafte Feld
    zurück oder null. */
function validateForm() {
  const f = form;
  const errs = {};
  const u = checkUrl(f.url);
  if (!u.ok) errs.url = u.err;
  if (!f.name && u.ok) f.name = nameFromUrl(u.href);
  if (!f.name) errs.name = 'Bitte einen Namen eingeben.';
  if (graphemes(f.icon).length > 2) errs.icon = 'Höchstens ein Emoji oder zwei Zeichen.';
  if (f.iconUrl) {
    const iu = checkUrl(f.iconUrl);
    if (!iu.ok) errs.iconurl = iu.err;
  }
  if (f.pkg && !PKG_RE.test(f.pkg)) errs.pkg = 'So sieht kein Paketname aus (Beispiel: org.chromium.webapk.a1b2c3).';

  for (const k of ['url', 'name', 'icon', 'iconurl', 'pkg']) {
    $('#f_' + k + '_err').textContent = errs[k] || '';
    $('#f_' + k).setAttribute('aria-invalid', errs[k] ? 'true' : 'false');
  }
  const first = ['url', 'name', 'pkg', 'icon', 'iconurl'].find((k) => errs[k]);
  return first ? $('#f_' + first) : null;
}

/** Formular prüfen und in db übernehmen. `quiet`: ohne Schließen und Toast
    (der Testmodus sichert vor jedem Test). Gibt die gespeicherte App zurück. */
function commitForm(quiet) {
  syncForm();
  const bad = validateForm();
  if (bad) { bad.focus(); return null; }
  const a = form;
  a.url = checkUrl(a.url).href;
  a.iconUrl = a.iconUrl ? checkUrl(a.iconUrl).href : '';
  const i = db.apps.findIndex((x) => x.id === a.id);
  const saved = JSON.parse(JSON.stringify(a));
  if (i >= 0) db.apps[i] = saved; else db.apps.push(saved);
  formIsNew = false;
  save();
  render();
  if (!quiet) { closeSheet(); toast(i >= 0 ? 'Gesichert' : 'Hinzugefügt'); }
  return saved;
}
function saveApp() { commitForm(false); }

/** Anleitung: Paketnamen einer installierten App herausfinden. */
function pkgHelpSheet(back) {
  openSheet('Paketname finden', `
    <ol class="dlg-t" style="padding-left:1.3em">
      <li>Die Ziel-App muss über das Chrome-Menü <b>⋮ → App installieren</b> installiert sein,
        nicht als bloße Verknüpfung.</li>
      <li>In Chrome in die Adressleiste <code>chrome://webapks</code> eintippen.
        (Ein Link dorthin geht nicht, Chrome erlaubt das nur von Hand.)</li>
      <li>Den Eintrag der App suchen (Name und Start-URL stehen dabei).</li>
      <li>Die Zeile <b>Package name</b> enthält den Namen, z. B. <code>org.chromium.webapk.a1b2c3d4e5_v2</code>.
        Lange drücken, kopieren und hier einfügen.</li>
      <li>Nach einer Neuinstallation der Ziel-App den Namen noch einmal prüfen.</li>
    </ol>
    <button type="button" class="btn btn-block" id="copyWebapks">„chrome://webapks“ kopieren</button>
    <button type="button" class="btn btn-primary btn-block" id="dlgOk">Verstanden</button>
  `, null);
  const zurueck = () => (back ? back() : closeSheet());
  $('#dlgOk').onclick = zurueck;
  $('#sheetCancel').onclick = zurueck;
  $('#copyWebapks').onclick = () => copyText('chrome://webapks');
}

/* ── Testmodus ──────────────────────────────────────────────────
   Welche Methode auf Deinem Gerät die installierte App öffnet, lässt sich nur
   ausprobieren (DECISIONS.md 2). Deshalb steht im Formular je Methode ein
   echter Link „Testen“ — echt, weil Chrome fremde Apps nur nach einem
   Tipp startet. Vor dem Test werden die Eingaben gesichert, und die Frage
   nach dem Ergebnis überlebt in sessionStorage auch einen Seitenwechsel
   (bei „gleiches Fenster“ verlässt der Test das Dashboard). */

const TEST_KEY = 'dashboard.test';
const TEST_TTL = 30 * 60 * 1000;      // so lange wartet die Frage auf eine Antwort
const TEST_ORDER = ['auto', 'pkg', 'same', 'tab'];
const dfShort = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'numeric', year: '2-digit' });

let pendingTest = null;    // { id, m, t } — Test läuft, Antwort steht aus

function renderTests() {
  const box = $('#f_tests');
  if (!box || !form) return;
  const f = form;
  const u = checkUrl(f.url);
  const pkgOk = PKG_RE.test(f.pkg);
  const current = effectiveMethod(f, db.method);
  const ask = pendingTest && pendingTest.id === f.id ? pendingTest.m : null;

  const rows = TEST_ORDER.map((m) => {
    const res = f.tests[m];
    const state = m === 'pkg' && !pkgOk ? '<small>braucht den Paketnamen</small>'
      : res ? `<small class="${res.r === 'ok' ? 'ok' : 'bad'}">${res.r === 'ok' ? '✓' : '✗'} ${esc(TEST_RESULTS[res.r])}`
        + `${res.d ? ' · ' + esc(dfShort.format(new Date(res.d))) : ''}</small>`
      : '<small>noch nicht getestet</small>';
    const usable = u.ok && (m !== 'pkg' || pkgOk);
    const t = u.ok ? launchTarget(u.href, m, f.pkg, IS_ANDROID) : null;
    const link = usable
      ? `<a class="btn btn-sm" data-test="${m}" href="${esc(t.href)}"${t.blank ? ' target="_blank" rel="noopener"' : ''}>Testen</a>`
      : `<a class="btn btn-sm" data-test="${m}" href="#" aria-disabled="true">Testen</a>`;
    return `<div class="trow"><div class="trow-t"><b>${esc(METHODS[m].long)}`
      + `${m === current ? '<span class="tag">Standard</span>' : ''}</b>${state}</div>${link}</div>`;
  }).join('');

  const tech = u.ok ? TEST_ORDER.map((m) =>
    `<b>${esc(METHODS[m].long)}</b><code>${esc(launchTarget(u.href, m, f.pkg, true).href)}</code>`).join('') : '';
  // Läuft bei jedem Tastendruck — aufgeklappte Technik-Ansicht soll dabei offen bleiben
  const techOpen = !!(box.querySelector('details.tech') || {}).open;

  box.innerHTML = `
    <div class="fld">
      <span class="fld-l">Öffnungsmethode testen</span>
      <p class="fld-hint" style="margin:0 0 var(--sp-3)">Tippe nacheinander auf „Testen“. Öffnet sich die installierte
        App in ihrem eigenen Fenster, ohne Adressleiste, komm zurück und tippe „Ja“. Ein Test sichert vorher Deine Eingaben.
        ${IS_ANDROID ? '' : '<br>Intent-Links gibt es nur auf Android, hier öffnen beide Intent-Methoden einen neuen Tab.'}</p>
      <div class="tests">${rows}</div>
      ${ask ? `<div class="test-ask" id="f_ask" role="group" aria-labelledby="f_ask_t">
        <p id="f_ask_t"><b>Test „${esc(METHODS[ask].long)}“:</b> Hat sich die installierte App in ihrem
          eigenen Fenster geöffnet, ohne Adressleiste?</p>
        <button type="button" class="btn btn-primary btn-block" data-ask="ok">Ja — als Standard nehmen</button>
        <button type="button" class="btn btn-block" data-ask="browser">Nein, Browser oder Adressleiste</button>
        <button type="button" class="btn btn-block" data-ask="none">Nein, nichts passiert</button>
        <button type="button" class="btn btn-ghost btn-block" data-ask="skip">Nicht beantworten</button>
      </div>` : ''}
      ${tech ? `<details class="tech"${techOpen ? ' open' : ''}><summary>Erzeugte Links anzeigen</summary>${tech}</details>` : ''}
    </div>`;
}

/** Tipp auf „Testen“. Läuft im Klick, also VOR der Navigation: hier nichts
    tun, was den angetippten Link aus dem DOM nimmt — ein entfernter Link
    navigiert nicht. Neu gezeichnet wird erst danach. */
function startTest(e, m) {
  syncForm();
  if (m === 'pkg' && !PKG_RE.test(form.pkg)) {
    e.preventDefault();
    $('#f_pkg_err').textContent = 'Für diesen Test zuerst den Paketnamen eintragen.';
    $('#f_pkg').focus();
    return;
  }
  const wasNew = formIsNew;
  const saved = commitForm(true);
  if (!saved) { e.preventDefault(); return; }
  pendingTest = { id: saved.id, m, t: Date.now() };
  try { sessionStorage.setItem(TEST_KEY, JSON.stringify(pendingTest)); } catch (err) { /* dann nur im Speicher */ }
  setTimeout(() => {
    if (!form || form.id !== saved.id) return;
    if (wasNew) appSheet(); else renderTests();     // aus „hinzufügen“ wird „bearbeiten“
    const ask = $('#f_ask');
    if (ask) ask.scrollIntoView({ block: 'center' });
  }, 400);
}

function clearPendingTest() {
  pendingTest = null;
  try { sessionStorage.removeItem(TEST_KEY); } catch (e) { /* egal */ }
}

/** Antwort auf „Wie hat sich … verhalten?“. Geklappt heißt: diese Methode wird
    der Standard für die App. Das Ergebnis bleibt bei der App gespeichert und
    wandert ins Backup — so ist notiert, was wo funktioniert. */
function answerTest(r) {
  const p = pendingTest;
  clearPendingTest();
  const a = p && db.apps.find((x) => x.id === p.id);
  if (!a || r === 'skip') { renderTests(); return; }
  a.tests[p.m] = { r, d: new Date().toISOString() };
  if (r === 'ok') a.method = p.m;
  save();
  render();
  if (form && form.id === a.id) {
    form.tests = JSON.parse(JSON.stringify(a.tests));
    if (r === 'ok') {
      form.method = p.m;
      $$('#sheetBody input[name="f_method"]').forEach((x) => { x.checked = x.value === p.m; });
    }
    refreshForm();
  }
  toast(r === 'ok' ? `${METHODS[p.m].long} ist jetzt Standard für ${a.name}` : 'Notiert — probier die nächste Methode');
}

/** Nach einem Seitenwechsel (Test mit „gleiches Fenster“) oder Neustart:
    offene Frage wieder vorlegen, solange sie nicht zu alt ist. */
function resumeTest() {
  let p = null;
  try { p = JSON.parse(sessionStorage.getItem(TEST_KEY) || 'null'); } catch (e) { /* egal */ }
  if (!p || typeof p !== 'object' || !METHODS[p.m] || Date.now() - p.t > TEST_TTL
      || !db.apps.some((a) => a.id === p.id)) { clearPendingTest(); return; }
  pendingTest = p;
  editApp(p.id);
  const ask = $('#f_ask');
  if (ask) ask.scrollIntoView({ block: 'center' });
}

async function copyText(s) {
  try { await navigator.clipboard.writeText(s); toast('Kopiert — in Chromes Adressleiste einfügen'); }
  catch (e) { toast('Kopieren ging nicht — bitte abtippen'); }
}

/* ── Einstellungen ──────────────────────────────────────────── */

/* Auswahlfelder der Einstellungen: [Wert, Beschriftung]. Die Werte landen
   als data-Attribut auf <html>, style.css stellt danach die Tokens um. */
const LOOK_OPTS = {
  theme:  [['light', 'Hell'], ['dark', 'Dunkel'], ['auto', 'Automatisch']],
  view:   [['icons', 'Symbole'], ['preview', 'Live-Vorschau']],
  layout: [['grid', 'Raster'], ['list', 'Liste']],
  size:   [['s', 'Kompakt'], ['m', 'Normal'], ['l', 'Groß']],
  shape:  [['square', 'Eckig'], ['rounded', 'Abgerundet'], ['round', 'Rund']],
  labels: [['on', 'Mit Name'], ['off', 'Ohne Name']],
  font:   [['s', 'Klein'], ['m', 'Normal'], ['l', 'Groß']],
};

/** Checkliste für Ziel-Apps — dieselbe steht im README. */
const CHECKLIST_HTML = `<ol>
  <li>Ziel-App über das Chrome-Menü <b>⋮ → App installieren</b> installieren, nicht als bloße Verknüpfung.
    Ob sie wirklich installiert ist, zeigt <code>chrome://webapks</code>.</li>
  <li>Die Adresse der Kachel liegt im Bereich (<code>scope</code> und <code>start_url</code>) der Ziel-App:
    bei Deinen Apps also genau <code>https://name.github.io/app/</code>, mit „/“ am Ende.</li>
  <li>Android-Einstellungen → Apps → Ziel-App → <b>Standardmäßig öffnen</b>: „Unterstützte Links öffnen“
    einschalten und die Domain freigeben. Das braucht „Automatisch“ und die beiden Link-Methoden.
    Android gibt eine Domain nur einer App: Liegen mehrere Apps auf <code>name.github.io</code>, kann nur eine die Freigabe haben.</li>
  <li>Paketnamen eintragen und „Intent mit Paket“ testen. Das ist der Weg, der ohne Freigabe auskommen sollte.</li>
  <li>Notieren, welche Methode für welche App funktioniert hat. Der Testmodus speichert das bei der App
    (Übersicht unten, auch im Backup).</li>
</ol>`;

/** Was man über die Live-Vorschau wissen sollte — dasselbe steht im README. */
const PREVIEW_NOTES_HTML = `<ul>
  <li><b>Dieselben Daten.</b> Vorschau und installierte App teilen sich den Speicher. Was Du in der großen App
    hier änderst, ist auch in der installierten App geändert, und umgekehrt.</li>
  <li><b>Nicht gleichzeitig benutzen.</b> Deine Apps lesen ihre Daten nur beim Start. Läuft eine App noch im
    Hintergrund, während Du sie hier änderst, überschreibt sie die Änderung beim nächsten Speichern. Also
    die installierte App vorher schließen oder dort einmal neu starten.</li>
  <li>Ändert die installierte App etwas, lädt die Vorschau die Kachel von selbst neu. Ist die App hier gerade
    groß, steht oben „In einem anderen Fenster geändert“. Ein Tipp darauf lädt sie neu.</li>
  <li>Zurück wirkt in der großen App wie in der App selbst: erst schließt sie ihr Fenster oder springt zur
    Übersicht, dann wird sie klein. ↗ oben rechts startet sie als installierte App.</li>
  <li>Nach einem Update einer App kann ein einzelner Druck auf Zurück ohne Wirkung bleiben. Der nächste wirkt wieder.</li>
  <li>Jede Vorschau ist eine laufende App. Bei vielen Kacheln kostet das etwas Speicher und Akku. In der Ansicht
    „Symbole“ läuft keine.</li>
</ul>`;

function openSettings() {
  const seg = (key) => `<div class="seg" role="group" aria-labelledby="st_${key}_l">${LOOK_OPTS[key].map(([v, l]) =>
    `<button type="button" data-set="${key}" data-val="${v}" aria-pressed="${db[key] === v}"`
    + ` class="${db[key] === v ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>`;
  const fld = (key, label, extra) => `<div class="fld"><span class="fld-l" id="st_${key}_l">${label}</span>${seg(key)}${extra || ''}</div>`;

  openSheet('Einstellungen', `
    <h2 class="sec">Darstellung</h2>
    <div class="fld">
      <label class="fld-l" for="st_title">Titel</label>
      <input class="inp" id="st_title" maxlength="${NAME_MAX}" autocomplete="off" value="${esc(db.title)}">
    </div>
    ${fld('view', 'Ansicht', `<p class="fld-hint">Symbole: ein Tipp startet die installierte App. Live-Vorschau:
      jede Kachel zeigt die App selbst, ein Tipp macht sie groß. Umschalten geht auch direkt oben,
      mit dem Knopf vor dem Stift.</p>`)}
    ${fld('theme', 'Theme')}
    <div class="fld">
      <span class="fld-l" id="st_accent_l">Akzentfarbe</span>
      <div class="swatches" id="st_accents" role="radiogroup" aria-labelledby="st_accent_l"></div>
    </div>
    ${fld('layout', 'Anordnung')}
    ${fld('size', 'Kachelgröße')}
    ${fld('shape', 'Kachelform')}
    ${fld('labels', 'Beschriftung', '<p class="fld-hint">Gilt für das Raster. In der Liste steht der Name immer da.</p>')}
    ${fld('font', 'Schriftgröße')}

    <h2 class="sec">Live-Vorschau</h2>
    <button type="button" class="btn btn-block${previewMode() ? '' : ' hidden'}" data-st="refresh" style="margin-bottom:var(--sp-3)">Alle Vorschauen neu laden</button>
    <details class="guide"><summary>Gut zu wissen</summary><div>${PREVIEW_NOTES_HTML}</div></details>

    <h2 class="sec">Öffnen</h2>
    <div class="fld" role="radiogroup" aria-labelledby="st_method_l">
      <span class="fld-l" id="st_method_l">Standard-Öffnungsmethode</span>
      <div class="choices">${Object.keys(METHODS).map((k) => `
        <label class="choice"><input type="radio" name="st_method" value="${k}"${db.method === k ? ' checked' : ''}>
          <span class="choice-t"><b>${esc(METHODS[k].long)}${k === 'pkg' ? '<span class="tag">empfohlen</span>' : ''}</b>
          <small>${esc(METHODS[k].desc)}${k === 'pkg' ? ' Apps ohne Paketnamen öffnen dann automatisch.' : ''}</small></span></label>`).join('')}
      </div>
      <p class="fld-hint">Gilt für alle Apps, bei denen „Standard“ eingestellt ist, bei den Symbolen für den Tipp
        auf die Kachel, in der Live-Vorschau für ↗ in der großen App. Welche Methode bei einer App klappt,
        findest Du im Formular der App heraus (Stift oben, dann die App antippen).</p>
    </div>
    <details class="guide"><summary>Checkliste für Ziel-Apps</summary><div>${CHECKLIST_HTML}</div></details>
    <details class="guide"><summary>Paketname finden</summary><div><ol>
      <li>In Chrome <code>chrome://webapks</code> in die Adressleiste tippen (ein Link dorthin geht nicht).</li>
      <li>Den Eintrag der App suchen, die Zeile <b>Package name</b> enthält z. B. <code>org.chromium.webapk.a1b2c3d4e5_v2</code>.</li>
      <li>Lange drücken, kopieren, im Formular der App bei „Android-Paketname“ einfügen.</li>
    </ol><button type="button" class="btn btn-sm" data-st="copy">„chrome://webapks“ kopieren</button></div></details>
    <details class="guide" id="st_results_box"><summary>Testergebnisse je App</summary><div id="st_results"></div></details>

    <h2 class="sec">Backup</h2>
    <p class="fld-hint" id="st_backup" style="margin:0 0 var(--sp-3)"></p>
    <div class="btn-row">
      <button type="button" class="btn" data-st="export">Exportieren</button>
      <button type="button" class="btn" data-st="import">Importieren</button>
    </div>
    <input type="file" accept="application/json,.json" class="hidden" id="st_file">

    <h2 class="sec">App</h2>
    <button type="button" class="btn btn-block hidden" id="btnInstall">App installieren</button>
    <p class="fld-hint" id="st_storage"></p>
    <div class="about" style="margin-top:12px">
      <span>Version <span class="num">${esc(APP_VERSION)}</span></span>
      <button type="button" class="btn btn-sm" data-st="update">Nach Update suchen</button>
    </div>
  `, null);

  renderAccents();
  renderResults();
  renderStorage();
  renderBackupInfo();
  $('#sheetBody').onclick = onSettingsClick;
  $('#sheetBody').onchange = onSettingsChange;
  $('#sheetBody').oninput = onSettingsInput;
  $('#st_file').onchange = (e) => { importBackup(e.target.files[0]); e.target.value = ''; };
  $('#btnInstall').onclick = installApp;
  syncInstall();
}

function renderAccents() {
  const cur = db.accent;
  const preset = ACCENTS.some(([c]) => c === cur);
  $('#st_accents').innerHTML = ACCENTS.map(([c, n]) =>
    `<button type="button" role="radio" aria-checked="${cur === c}" aria-label="${esc(n)}"
      class="${cur === c ? 'on' : ''}" data-accent="${c}" style="--sw:${c}"></button>`).join('')
    + `<label class="swatch-custom${preset ? '' : ' on'}" style="--sw:${esc(cur)};--on:${onColor(cur)}"
        title="Eigene Farbe">${ICON_DROP}<input type="color" id="st_accent" value="${esc(cur)}" aria-label="Eigene Akzentfarbe"></label>`;
}

/** Übersicht: welche Methode ist bei welcher App Standard, was hat geklappt. */
function renderResults() {
  const box = $('#st_results');
  if (!box) return;
  if (!db.apps.length) { box.innerHTML = '<p>Noch keine Apps.</p>'; return; }
  box.innerHTML = `<ul class="results">${db.apps.map((a) => {
    const done = TEST_ORDER.filter((m) => a.tests[m])
      .map((m) => `${a.tests[m].r === 'ok' ? '✓' : '✗'} ${esc(METHODS[m].label)}`).join(', ');
    return `<li><span>${esc(a.name)}</span><span>${esc(METHODS[effectiveMethod(a, db.method)].label)}`
      + `${a.method === 'default' ? ' (Standard)' : ''}<br><small class="muted">${done || 'noch nicht getestet'}</small></span></li>`;
  }).join('')}</ul>`;
}

/** Speicherstatus: dauerhaft, flüchtig oder gar nicht. */
async function renderStorage() {
  const el = $('#st_storage');
  if (!el) return;
  if (memOnly) { el.textContent = 'Speichern ist gerade nicht möglich. Änderungen gelten nur bis zum Schließen.'; el.classList.add('warn'); return; }
  let p = null;
  try { p = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null; } catch (e) { /* egal */ }
  el.textContent = p === true ? 'Speicher: dauerhaft, der Browser räumt ihn nicht von selbst weg.'
    : p === false ? 'Speicher: Der Browser darf ihn bei Platzmangel leeren. Ein Backup schützt davor.'
    : '';
}

/** Eine Darstellungs-Einstellung umstellen: sofort sichtbar, sofort gespeichert. */
function setLook(key, val) {
  db[key] = val;
  applyLook();
  save();
  // In der Vorschau auch Größe und Form: die Kacheln brauchen ihren neuen Maßstab
  if (key === 'layout' || key === 'labels' || key === 'view' || previewMode()) render();
}

function onSettingsClick(e) {
  const b = e.target.closest('button');
  if (!b) return;
  const ds = b.dataset;
  if (ds.set) {
    if (ds.set === 'view') {
      setView(ds.val);
      $('#sheetBody [data-st="refresh"]').classList.toggle('hidden', !previewMode());
    } else setLook(ds.set, ds.val);
    $$(`#sheetBody [data-set="${ds.set}"]`).forEach((x) => {
      x.classList.toggle('on', x === b);
      x.setAttribute('aria-pressed', String(x === b));
    });
  } else if (ds.accent) {
    setLook('accent', ds.accent);
    renderAccents();
  } else if (ds.st === 'update') {
    checkForUpdate();
  } else if (ds.st === 'export') {
    exportBackup();
    renderBackupInfo();
  } else if (ds.st === 'import') {
    $('#st_file').click();
  } else if (ds.st === 'copy') {
    copyText('chrome://webapks');
  } else if (ds.st === 'refresh') {
    refreshAll();
    closeSheet();
    toast('Vorschauen werden neu geladen');
  }
}

function onSettingsChange(e) {
  if (e.target.name === 'st_method') {
    db.method = e.target.value;
    save();
    render();                // Kachel-Links mit Standard-Methode neu bauen
    renderResults();
  } else if (e.target.id === 'st_title') {
    save();
  }
}

let titleTimer = 0;
function onSettingsInput(e) {
  if (e.target.id === 'st_title') {
    db.title = e.target.value.trim().slice(0, NAME_MAX) || blank().title;
    $('#title').textContent = db.title;
    document.title = db.title;
    clearTimeout(titleTimer);
    titleTimer = setTimeout(save, 400);       // nicht bei jedem Buchstaben schreiben
  } else if (e.target.id === 'st_accent') {
    /* Nicht neu zeichnen: der native Farbwähler hängt an diesem <input>. */
    const c = e.target.value.toLowerCase();
    if (!HEX_RE.test(c)) return;
    setLook('accent', c);
    $$('#st_accents [data-accent]').forEach((x) => { x.classList.remove('on'); x.setAttribute('aria-checked', 'false'); });
    const cu = $('#st_accents .swatch-custom');
    cu.classList.add('on');
    cu.style.setProperty('--sw', c);
    cu.style.setProperty('--on', onColor(c));
  }
}

/* ── Backup ─────────────────────────────────────────────────── */

const dfDate = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
const BACKUP_DAYS = 60;      // danach erinnert ein Punkt am Zahnrad
/* Diese Backups versteht der Import. „Dashboard Vorschau“ war eine eigene
   Fassung mit Live-Vorschau (Ordner vorschau/), Format wie hier. */
const BACKUP_APPS = ['Dashboard', 'Dashboard Vorschau'];

/** Ist ein Backup fällig? Ab drei Apps ohne Backup oder wenn das letzte
    lange her ist. Bei einer einzelnen frischen Kachel wäre ein Hinweis nur lästig. */
function backupDue() {
  if (!db.apps.length) return false;
  if (!db.lastBackup) return db.apps.length >= 3;
  return Date.now() - Date.parse(db.lastBackup) > BACKUP_DAYS * 864e5;
}

function renderBackupInfo() {
  const el = $('#st_backup');
  if (el) {
    el.classList.toggle('warn', backupDue());
    el.textContent = (db.lastBackup ? `Letztes Backup am ${dfDate.format(new Date(db.lastBackup))}. ` : 'Noch kein Backup. ')
      + 'Apps und Einstellungen liegen nur auf diesem Gerät. „Browserdaten löschen“ heißt: alles weg.';
  }
  $('#btnSettings').classList.toggle('badge', backupDue());
}

/** Lokales Datum für den Dateinamen — toISOString() wäre UTC und nach
    Mitternacht noch „gestern“. */
const localDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function exportBackup() {
  db.lastBackup = new Date().toISOString();
  save();
  /* Der gesamte Datensatz wandert unverändert in die Datei. `meta` steht nur
     als Kopfzeile davor und wird beim Import wieder entfernt (siehe
     normalize), damit es nicht in die Daten wandert. `format` ist SCHEMA. */
  const payload = Object.assign({
    meta: { app: 'Dashboard', appVersion: APP_VERSION, format: db.v, exported: db.lastBackup },
  }, db);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `dashboard-${localDay(new Date())}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Backup gespeichert');
}

/** Grobe Prüfung vor dem Import. Die Feinarbeit (jede App einzeln) macht
    normalize(). Gibt eine Fehlermeldung zurück oder null. */
function checkBackup(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return 'Die Datei ist kein Backup des Dashboards.';
  const m = plain(d.meta);
  // Alle Deine Apps exportieren JSON — ein Habits-Backup hier zu laden wäre ein leicht gemachter Fehler
  if (typeof m.app === 'string' && !BACKUP_APPS.includes(m.app)) return `Das ist ein Backup von „${m.app}“, nicht vom Dashboard.`;
  if (!Array.isArray(d.apps)) return 'Die Datei ist kein Backup des Dashboards: Es fehlt die Liste der Apps.';
  const v = Number.isInteger(d.v) ? d.v : 0;
  if (v > SCHEMA) {
    return `Das Backup stammt aus einer neueren Fassung des Dashboards (Format ${v}, diese kann ${SCHEMA}). `
      + 'Bitte erst aktualisieren: Einstellungen → Nach Update suchen.';
  }
  return null;
}

function importBackup(file) {
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { infoSheet('Import fehlgeschlagen', 'Die Datei ist zu groß für ein Backup des Dashboards.', openSettings); return; }
  const r = new FileReader();
  r.onload = () => {
    let d;
    try { d = JSON.parse(r.result); }
    catch (e) { infoSheet('Import fehlgeschlagen', 'Die Datei ist kein gültiges JSON.', openSettings); return; }
    const err = checkBackup(d);
    if (err) { infoSheet('Import fehlgeschlagen', err, openSettings); return; }
    importSheet(d, normalize(JSON.parse(r.result)));
  };
  r.onerror = () => infoSheet('Import fehlgeschlagen', 'Die Datei ließ sich nicht lesen.', openSettings);
  r.readAsText(file);
}

/** Vorschau und Wahl: Zusammenführen (nur neue Apps, Einstellungen bleiben)
    oder Ersetzen (alles aus dem Backup). */
function importSheet(raw, incoming) {
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const skipped = raw.apps.length - incoming.apps.length;
  const known = new Set(db.apps.map((a) => a.url));
  const fresh = incoming.apps.filter((a) => !known.has(a.url));
  const m = plain(raw.meta);
  const stand = m.exported && !isNaN(Date.parse(m.exported)) ? ` vom ${dfDate.format(new Date(m.exported))}` : '';

  openSheet('Backup laden', `
    <p class="dlg-t">Das Backup${esc(stand)} enthält ${plural(incoming.apps.length, 'App', 'Apps')} und die Einstellungen.
      ${skipped ? `${plural(skipped, 'Eintrag hat', 'Einträge haben')} keine gültige Adresse und ${skipped === 1 ? 'fällt' : 'fallen'} weg.` : ''}</p>
    <button type="button" class="btn btn-primary btn-block" id="impMerge"${fresh.length ? '' : ' aria-disabled="true"'}>Zusammenführen</button>
    <p class="fld-hint" style="margin:6px 0 var(--sp-4)">${fresh.length
      ? `Fügt ${plural(fresh.length, 'neue App', 'neue Apps')} hinzu. Vorhandene Apps und Deine Einstellungen bleiben.`
      : 'Alle Apps aus dem Backup sind schon da.'}</p>
    <button type="button" class="btn btn-danger btn-block" id="impReplace">Ersetzen</button>
    <p class="fld-hint" style="margin:6px 0 var(--sp-4)">Apps und Einstellungen werden komplett durch das Backup ersetzt.</p>
    <button type="button" class="btn btn-block" id="impNo">Abbrechen</button>
  `, null);
  $('#sheetCancel').onclick = openSettings;
  $('#impNo').onclick = openSettings;
  $('#impMerge').onclick = () => {
    if (!fresh.length) return;
    const ids = new Set(db.apps.map((a) => a.id));
    for (const a of fresh) {
      if (ids.has(a.id)) a.id = uid();
      ids.add(a.id);
      db.apps.push(a);
    }
    save(); closeSheet(); render(); toast(`${plural(fresh.length, 'App', 'Apps')} hinzugefügt`);
  };
  $('#impReplace').onclick = () => {
    db = incoming;
    applyLook(); save(); closeSheet(); render(); toast('Backup geladen');
  };
}

/* ── Updates ────────────────────────────────────────────────── */

/** Welche APP_VERSION liegt im Offline-Cache? Das ist die Fassung, die beim
    nächsten Laden ausgeliefert wird — nicht zwingend die laufende. Nur eigene
    Caches: alle Apps auf <name>.github.io teilen sich den Cache-Speicher. */
async function cachedVersion() {
  if (!('caches' in window)) return null;
  /* Während eines Updates liegen kurz alter und neuer Cache nebeneinander.
     Deshalb alle eigenen ansehen und eine abweichende Fassung vorziehen. */
  let found = null;
  for (const k of await caches.keys()) {
    if (!k.startsWith('dashboard-')) continue;
    const c = await caches.open(k);
    const res = (await c.match('./app.js')) || (await c.match('app.js'));
    if (!res) continue;
    const m = (await res.text()).match(/APP_VERSION\s*=\s*'([^']+)'/);
    if (!m) continue;
    if (m[1] !== APP_VERSION) return m[1];
    found = m[1];
  }
  return found;
}

const RELOAD_KEY = 'dashboard.reload';
let reloadWhenReady = false;     // „Nach Update suchen“: sobald die neue Fassung bereitliegt, direkt laden

/** Liegt im Cache eine andere Fassung als die laufende, erscheint unten die
    Leiste „Neue Version verfügbar“. Kein automatisches Neuladen: Wer gerade
    eine Kachel antippt oder ein Formular ausfüllt, soll nicht unterbrochen
    werden. Die Sperre in sessionStorage verhindert, dass die Leiste nach dem
    Neuladen wiederkommt, falls sich die Version wider Erwarten nicht ändert. */
async function offerUpdate() {
  const cv = await cachedVersion();
  if (!cv || cv === APP_VERSION) return false;
  let tried = null;
  try { tried = sessionStorage.getItem(RELOAD_KEY); } catch (e) { /* egal */ }
  if (tried === cv) return false;
  if (reloadWhenReady) { reloadNow(cv); return true; }
  const bar = $('#updateBar');
  bar.dataset.v = cv;
  bar.classList.remove('hidden');
  return true;
}

/** Neu laden, aber erst, wenn der neue Worker aktiv ist — sonst liefert der
    alte noch einmal die alte Fassung. Die Leiste kann schon erscheinen,
    sobald der neue Cache gefüllt ist, also kurz vor dem Aktivieren. */
async function reloadNow(cv) {
  try { sessionStorage.setItem(RELOAD_KEY, cv || $('#updateBar').dataset.v || ''); } catch (e) { /* egal */ }
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
    const w = reg && (reg.installing || reg.waiting);
    if (w) {
      await new Promise((res) => {
        w.addEventListener('statechange', () => { if (w.state === 'activated' || w.state === 'redundant') res(); });
        setTimeout(res, 3000);
      });
    }
  } catch (e) { /* dann eben sofort */ }
  location.reload();
}

function wireUpdates() {
  $('#btnReload').onclick = () => reloadNow();
  if (!('serviceWorker' in navigator)) return;

  /* Auf 'controllerchange' ist kein Verlass: aktualisiert sich dieselbe
     Registrierung, gilt die Seite nicht als "neu kontrolliert" und das
     Ereignis bleibt aus. Verlässlich ist der Zustandswechsel des neuen
     Workers auf 'activated' — dann liegt der frische Cache bereit. */
  const watch = (w) => {
    if (!w) return;
    if (w.state === 'activated') { offerUpdate(); return; }
    w.addEventListener('statechange', () => { if (w.state === 'activated') offerUpdate(); });
  };

  navigator.serviceWorker.addEventListener('controllerchange', () => offerUpdate());

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      watch(reg.installing); watch(reg.waiting);
      reg.addEventListener('updatefound', () => watch(reg.installing));
      navigator.serviceWorker.ready.then(() => offerUpdate());
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    }).catch(() => {});
  });
}

/** „Nach Update suchen“ in den Einstellungen: hier ist Neuladen gewollt. */
async function checkForUpdate() {
  if (!('serviceWorker' in navigator)) { toast('Updates gibt es nur über https, in der installierten App'); return; }
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) { toast('Offline-Modus noch nicht bereit — später noch einmal'); return; }
    toast('Suche …');
    reloadWhenReady = true;
    await reg.update();
    if (reg.installing || reg.waiting) { closeSheet(); toast('Neue Version wird geladen …', 4000); return; }
    const cv = await cachedVersion();
    if (cv && cv !== APP_VERSION) { closeSheet(); reloadNow(cv); return; }
    reloadWhenReady = false;
    toast(`Version ${APP_VERSION} ist aktuell`);
  } catch (e) {
    reloadWhenReady = false;
    toast('Keine Verbindung — später noch einmal');
  }
}

/* ── Installieren ───────────────────────────────────────────────
   Eigener Knopf statt Chrome-Menü: Chrome 154–157 meldet dort „bereits
   installiert“, sobald irgendeine andere App auf derselben Domain installiert
   ist (crbug.com/568841400, behoben ab Chrome 158). beforeinstallprompt prüft
   pro App und ist nicht betroffen. Chrome schickt das Ereignis nur, solange
   die App wirklich installierbar ist. In der installierten App und nach der
   Installation bleibt es aus, der Knopf verschwindet also von selbst. */
let installEvt = null;

/** Knopf in den Einstellungen ein- oder ausblenden. Das Ereignis kommt oft
    erst ein paar Sekunden nach dem Laden, unter Umständen bei schon offenen
    Einstellungen. */
function syncInstall() {
  const b = $('#btnInstall');
  if (b) b.classList.toggle('hidden', !installEvt);
}

function wireInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();             // keine eigene Leiste von Chrome, der Knopf reicht
    installEvt = e;
    syncInstall();
  });
  window.addEventListener('appinstalled', () => {
    installEvt = null;
    syncInstall();
    toast('Dashboard ist installiert');
  });
}

async function installApp() {
  const e = installEvt;
  if (!e) { installHelpSheet(); return; }
  installEvt = null;                // prompt() geht nur einmal pro Ereignis
  syncInstall();
  e.prompt();
  await e.userChoice.catch(() => {});
}

/** Ohne beforeinstallprompt: den Weg übers Chrome-Menü erklären. */
function installHelpSheet() {
  infoSheet('Dashboard installieren',
    'Chrome bietet die Installation gerade nicht direkt an. Öffne das Chrome-Menü ⋮ und wähle „App installieren“ '
    + '(nicht „Zum Startbildschirm hinzufügen“ als Verknüpfung, die öffnet immer mit Adressleiste). '
    + 'Meldet Chrome „bereits installiert“, obwohl das nicht stimmt (Chrome 154–157), warte ein paar Sekunden '
    + 'nach dem Laden und tippe erneut auf „Installieren“. Welche Apps wirklich installiert sind, zeigt chrome://webapks.');
}

/* ── Sheet-System ───────────────────────────────────────────── */
let sheetSaveFn = null;
let sheetReturnFocus = null;

function openSheet(title, html, saveFn, saveLabel) {
  armBack();                              // Zurück soll das Sheet schließen, nicht die App
  const sheet = $('#sheet');
  if (sheet.classList.contains('hidden')) sheetReturnFocus = document.activeElement;
  $('#sheetTitle').textContent = title;
  $('#sheetBody').innerHTML = html;
  $('#sheetBody').onclick = null;         // Handler des vorherigen Sheets verwerfen
  $('#sheetBody').oninput = null;
  $('#sheetBody').onchange = null;
  $('#sheetCancel').onclick = closeSheet; // ggf. überschriebenes Abbrechen zurücksetzen
  sheetSaveFn = saveFn || null;
  const btn = $('#sheetSave');
  btn.classList.toggle('hidden', !saveFn);
  btn.textContent = saveLabel || 'Sichern';
  sheet.classList.remove('hidden');
  $('#scrim').classList.remove('hidden');
  // Hintergrund für Tastatur und Screenreader sperren, solange das Sheet offen ist
  $('#topbar').inert = true; $('#main').inert = true;
  $('#sheetBody').scrollTop = 0;
  sheet.tabIndex = -1;
  sheet.focus({ preventScroll: true });
}

function closeSheet() {
  $('#sheet').classList.add('hidden');
  $('#scrim').classList.add('hidden');
  $('#topbar').inert = false; $('#main').inert = false;
  sheetSaveFn = null;
  form = null;
  const f = sheetReturnFocus;
  sheetReturnFocus = null;
  if (f && document.contains(f) && f !== document.body) f.focus({ preventScroll: true });
}

const sheetOpen = () => !$('#sheet').classList.contains('hidden');

/* ── Dialoge ────────────────────────────────────────────────────
   Ersatz für die nativen Browser-Dialoge: installierte Web-Apps unterdrücken
   sie je nach Gerät kommentarlos — der Knopf tut dann scheinbar nichts. Diese
   hier sind normale Sheets und funktionieren überall gleich.
   `back` führt zurück zum vorherigen Sheet statt alles zuzuklappen. */

function askSheet(title, text, okLabel, onOk, back, danger) {
  openSheet(title, `
    <p class="dlg-t">${esc(text)}</p>
    <button class="btn ${danger ? 'btn-danger' : 'btn-primary'} btn-block" id="dlgOk">${esc(okLabel)}</button>
    <button class="btn btn-block" id="dlgNo">Abbrechen</button>
  `, null);
  const zurueck = () => (back ? back() : closeSheet());
  $('#dlgOk').onclick = onOk;
  $('#dlgNo').onclick = zurueck;
  $('#sheetCancel').onclick = zurueck;
}

function infoSheet(title, text, back) {
  openSheet(title, `
    <p class="dlg-t">${esc(text)}</p>
    <button class="btn btn-primary btn-block" id="dlgOk">Verstanden</button>
  `, null);
  const zurueck = () => (back ? back() : closeSheet());
  $('#dlgOk').onclick = zurueck;
  $('#sheetCancel').onclick = zurueck;
}

/* ── Zurück-Taste ───────────────────────────────────────────────
   Ohne Zutun beendet ein einziger Druck auf Zurück die installierte App —
   viel zu leicht aus Versehen. Deshalb liegt ein zusätzlicher Verlaufseintrag
   („Wächter") über der App: Zurück landet dann bei uns statt beim System.

   Der Druck schließt der Reihe nach, was offen ist — Sheet, große App (die
   erst selbst reagieren darf, siehe backInApp), Suche, Bearbeitungsmodus —
   und baut den Wächter danach wieder auf. Steht nichts mehr offen, fragt ein
   Dialog nach. Die Apps in den Vorschauen legen keine eigenen Einträge an
   (patchFrame), deshalb landet jeder Druck hier. */
let guardUp = false;
let leaving = false;

function pushGuard() {
  if (guardUp) return;
  guardUp = true;
  try { history.pushState({ g: 1 }, ''); } catch (e) { guardUp = false; }
}

/** Vor allem, was die Zurück-Taste abfangen soll: Sheet öffnen, Modus wechseln. */
function armBack() { pushGuard(); }

/** „Verlassen" im Abschiedsdialog: der Dialog hat selbst einen Wächter
    aufgebaut (jedes Sheet tut das). Erst ihn abräumen, dann führt der zweite
    Schritt aus der App. Beides muss über zwei Runden laufen — history.back()
    zweimal hintereinander fasst der Browser zu einem Schritt zusammen. */
function leaveApp() {
  closeSheet();
  leaving = true;
  history.back();
}

function wireBack() {
  pushGuard();
  window.addEventListener('popstate', () => {
    guardUp = false;

    if (leaving) {
      leaving = false;
      history.back();
      // Falls nichts mehr zum Zurückgehen da ist (im Browser-Tab, in dem die App
      // der erste Eintrag ist), bleiben wir hier — dann fehlt der Wächter. Kein
      // Timer zum Nachrüsten: ein pushState würde den laufenden Schritt abbrechen
      // und genau das Verlassen verhindern. Also erst beim nächsten Antippen.
      document.addEventListener('pointerdown', pushGuard, { once: true });
      return;
    }
    // Über den Abbrechen-Knopf, nicht über closeSheet: verschachtelte Sheets
    // haben dort ihren Rückweg zum vorherigen Sheet hinterlegt.
    if (sheetOpen()) { $('#sheetCancel').click(); pushGuard(); return; }
    if (opened) { backInApp(); pushGuard(); return; }
    if (query) { query = ''; $('#search').value = ''; render(); pushGuard(); return; }
    if (editing) { setEditing(false); pushGuard(); return; }

    askSheet('App verlassen?', 'Möchtest Du das Dashboard wirklich schließen?',
      'Verlassen', leaveApp);
  });
}

/* ── Verdrahtung ────────────────────────────────────────────── */

let pressFired = false;    // langer Druck hat schon ausgelöst — der folgende Klick darf nicht öffnen

function wire() {
  document.body.addEventListener('click', (e) => {
    const t = e.target.closest('#grid .tile');
    if (t) {
      if (pressFired) { e.preventDefault(); pressFired = false; return; }
      if (Date.now() - dragEndedAt < 400) { e.preventDefault(); return; }   // Loslassen nach dem Ziehen
      if (t.dataset.act === 'add') { newApp(); return; }
      if (editing) { e.preventDefault(); editApp(t.dataset.id); return; }
      if (previewMode()) { openApp(t.dataset.id); return; }   // Vorschau: die App wird groß
      return;               // Symbole: der Link öffnet von selbst, mit echter Benutzergeste
    }
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const act = a.dataset.act;
    if (act === 'add') newApp();
    else if (act === 'install') installApp();
    else if (act === 'hide-hint') {
      try { sessionStorage.setItem(HINT_KEY, '1'); } catch (err) { /* egal */ }
      renderNotices();
    } else if (act === 'hide-loadfail') {
      loadFailed = false;
      renderNotices();
    }
  });
  $('#btnAdd').onclick = newApp;
  $('#btnEdit').onclick = () => setEditing(true);
  $('#btnView').onclick = () => setView(db.view === 'preview' ? 'icons' : 'preview');
  $('#btnDone').onclick = () => setEditing(false);
  $('#btnSettings').onclick = openSettings;
  $('#sheetCancel').onclick = closeSheet;
  $('#scrim').onclick = () => {
    // Der Klick, der einem langen Druck folgt, darf das eben geöffnete Formular nicht schließen
    if (pressFired) { pressFired = false; return; }
    $('#sheetCancel').click();   // wie Abbrechen, damit verschachtelte Sheets zurückführen
  };
  $('#sheetSave').onclick = () => sheetSaveFn && sheetSaveFn();

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sheetOpen()) { e.preventDefault(); $('#sheetCancel').click(); return; }
    // Fokus in der Leiste der großen App; steht er in der App selbst, hilft hookFrame
    if (e.key === 'Escape' && opened) { e.preventDefault(); closeApp(); return; }
    // Bearbeitungsmodus: Umschalt + Pfeiltaste verschiebt die Kachel mit dem Fokus
    const t = e.target.closest && e.target.closest('#grid .tile[data-id]');
    if (t && editing && e.shiftKey && /^Arrow(Left|Right|Up|Down)$/.test(e.key)) {
      e.preventDefault();
      moveApp(t.dataset.id, e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1);
    }
  });

  const search = $('#search');
  search.addEventListener('input', () => {
    if (search.value && !query) armBack();        // Zurück leert erst die Suche
    query = search.value;
    render();
  });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (previewMode()) {
        // Erster Treffer wird groß
        const first = $('#grid .tile[data-id]:not(.hidden)');
        if (first) { e.preventDefault(); search.blur(); openApp(first.dataset.id); }
        return;
      }
      // Erster Treffer öffnet — der Klick läuft in der Tastenaktion, zählt also als Benutzergeste
      const first = $('#grid a.tile');
      if (first) { e.preventDefault(); first.click(); }
    } else if (e.key === 'Escape' && query) {
      e.preventDefault();
      query = ''; search.value = '';
      render();
    }
  });
  // Wer aus der Suche eine App öffnet, soll beim Zurückkommen wieder alle Kacheln sehen
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && query) { query = ''; search.value = ''; render(); }
  });

  wireDrag();
  // Bilder fremder Apps: Fehler kommen nicht durch, deshalb in der Capture-Phase
  document.addEventListener('error', onImgError, true);

  lightMq.addEventListener('change', () => { if (db.theme === 'auto') applyLook(); });

  wireLongPress();
}

/** Lange drücken auf eine Kachel öffnet sie zum Bearbeiten. Android meldet
    den langen Druck auf einen Link außerdem als contextmenu — das öffnet
    dasselbe Formular und unterdrückt Chromes Link-Menü. Was zuerst kommt,
    gewinnt; pressFired verhindert, dass der Klick danach die App öffnet. */
function wireLongPress() {
  let timer = 0, x = 0, y = 0;
  const cancel = () => { clearTimeout(timer); timer = 0; };
  const fire = (id) => {
    cancel();
    if (pressFired || sheetOpen()) return;
    pressFired = true;
    buzz(18);
    editApp(id);
  };
  document.addEventListener('pointerdown', (e) => {
    pressFired = false;          // Nicht jeder lange Druck endet in einem Klick — hier sicher zurücksetzen
    const t = e.target.closest('#grid .tile[data-id]');
    if (!t || e.button > 0 || editing) return;
    x = e.clientX; y = e.clientY;
    cancel();
    timer = setTimeout(() => fire(t.dataset.id), LONG_PRESS_MS);
  });
  document.addEventListener('pointermove', (e) => {
    if (timer && Math.hypot(e.clientX - x, e.clientY - y) > 10) cancel();
  });
  document.addEventListener('pointerup', cancel);
  document.addEventListener('pointercancel', cancel);
  document.addEventListener('contextmenu', (e) => {
    const t = e.target.closest('#grid .tile');
    if (!t) return;
    e.preventDefault();
    if (!editing && t.dataset.id) fire(t.dataset.id);
  });
}

/* ── Start ──────────────────────────────────────────────────── */

load();
applyLook();
wire();
wireBack();
wirePreviews();
measureFrames();             // vor dem ersten render: die Vorschauen brauchen ihr Seitenverhältnis
renderNotices();
render();
resumeTest();

/* Bittet den Browser, den Speicher nicht bei Platzmangel wegzuräumen. */
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

wireUpdates();
wireInstall();
