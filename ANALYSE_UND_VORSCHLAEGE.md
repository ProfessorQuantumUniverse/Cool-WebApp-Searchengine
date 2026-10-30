# Analyse & Vorschläge: Stand Oktober 2026

Die ursprüngliche Analyse stammt vom November 2025. Seitdem wurde die Seite neu gebaut (Daten in `data.json`, Vanilla HTML/CSS/JS ohne Build-Step). Diese Datei hält fest, was davon umgesetzt ist, was bewusst nicht kommt und was noch offen ist.

## Umgesetzt

- **Suche:** sofortige Suche über Namen, Taglines, Beschreibungen, Tags, Kategorien und Domains, mit Entprellung.
- **Fuzzy-Suche, bewusst vorsichtig:** Vertauschte Buchstaben zählen als ein Fehler. Unter 4 Buchstaben wird nichts korrigiert, bei 4–7 Buchstaben ein Fehler, ab 8 zwei. Es zählt nur die nächstliegende Korrektur, und korrigiert wird nur in Richtung von Wörtern aus Namen, Tags, Taglines und Kategorien.
- **Autocomplete:** lokal und unaufdringlich als graue Inline-Ergänzung, übernehmen mit Tab oder →.
- **Filter:** Kategorien mehrfach wählbar, dazu Tags und Favoriten (im `localStorage`).
- **Sortierung:** Best match, A–Z, Z–A und Recently added.
- **Teilbare URLs:** für Suche, Filter, Sortierung und Einträge (`?cat=maps,space`, `#nukemap`).
- **Design:** neu mit Geist und Geist Mono (selbst gehostet) und Kobalt-Akzent, hell/dunkel nach Systemeinstellung, responsiv.
- **Animationen:** Skeleton Loading, Überblenden bei Filterwechseln (View Transitions), animierter Detail-Dialog; alles respektiert `prefers-reduced-motion`.
- **Eigene Favicons:** SVG, PNG und Apple Touch Icon.
- **Screenshots:** selbst erzeugt (Playwright, Ghostery gegen Cookie-Banner), als WebP im Repo und lazy geladen; thum.io ist abgelöst.
- **Caching:** Der Katalog wird stale-while-revalidate aus dem `localStorage` geladen, ein Service Worker cacht Bilder und Schriften.
- **Einreichen:** Mini-Formular auf der Seite öffnet ein vorausgefülltes GitHub-Issue-Formular; „Report a problem“ läuft genauso.
- **Barrierefreiheit:** Skip-Link, sichtbarer Fokus, ARIA-Zustände, Tastatur (<kbd>/</kbd> fokussiert die Suche).
- **Sicherheit:** CSP eng gefasst, Ausgaben werden escaped, Links nur über http(s).
- **Datenprüfung:** `scripts/validate.mjs` prüft `data.json`.

## Bewusst nicht

- Suchhistorie, beliebte Suchen, mehrere Suchfelder: zu kompliziert für den Nutzen.
- Zusätzliche Hover-Effekte: zu unruhig.
- Offline-Modus und PWA-Installation: Die verlinkten Seiten brauchen ohnehin Internet.
- Testsuite im Repo: Die Suche wird nur lokal getestet, wenn sie getunt wird.

## Noch offen (Ideen)

- „Ähnliche Seiten“ in der Detailansicht (gleiche Tags oder Kategorie).
- Tags in den Ergebnissen direkt anklickbar machen.
- Open-Graph-Bild und strukturierte Daten (`SearchAction`) für schönere Vorschauen beim Teilen.
- Einzelne Screenshots mit störenden Popups gezielt neu aufnehmen oder per Hand ersetzen.
