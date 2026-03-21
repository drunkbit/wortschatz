# Wortschatz

Eine umfassende deutsche Wortliste zur freien Weiterverarbeitung.

Die Wörter stammen aus mehreren Quellen und werden in zwei Varianten bereitgestellt:

- **Originalschreibung** — Groß-/Kleinschreibung wie im Wörterbuch (Nomen groß etc.)
- **Lowercase** — Alle Wörter kleingeschrieben

Beide Varianten gibt es als **eine Gesamtdatei** (`_alle.txt`) und **aufgeteilt nach Anfangsbuchstabe** (a–z + ae, oe, ue für Umlaute).

## Verzeichnisstruktur

```
wortschatz/
├── wortliste/
│   ├── original/           # Originalschreibung
│   │   ├── _alle.txt       # Alle Wörter in einer Datei
│   │   ├── a.txt ... z.txt # Pro Buchstabe
│   │   ├── ae.txt          # Wörter mit Ä/ä am Anfang
│   │   ├── oe.txt          # Wörter mit Ö/ö am Anfang
│   │   └── ue.txt          # Wörter mit Ü/ü am Anfang
│   └── lowercase/          # Alles kleingeschrieben
│       ├── _alle.txt
│       ├── a.txt ... z.txt
│       ├── ae.txt
│       ├── oe.txt
│       └── ue.txt
├── tools/                  # Extraktions- und Build-Tools
│   ├── src/
│   │   ├── sources/        # Ein Extraktor pro Quelle
│   │   │   ├── hunspell.ts
│   │   │   ├── wiktionary.ts
│   │   │   ├── dwds.ts
│   │   │   └── text-extraktor.ts
│   │   ├── pipeline/       # Verarbeitung & Export
│   │   │   ├── merge.ts
│   │   │   ├── normalize.ts
│   │   │   ├── split.ts
│   │   │   └── export.ts
│   │   └── index.ts        # CLI Entry Point
│   └── input/              # Eigene Texte hier ablegen
├── README.md
└── LICENSE
```

## Format

- **Plaintext** (`.txt`), UTF-8
- Ein Wort pro Zeile
- Alphabetisch sortiert (deutsche Locale)
- Keine Duplikate innerhalb einer Datei

## Nutzung der Wortliste

Die Dateien im `wortliste/`-Verzeichnis können direkt heruntergeladen und verwendet werden.

**Beispiele:**

```bash
# Alle Wörter (Originalschreibung)
curl -O https://raw.githubusercontent.com/drunkbit/wortschatz/main/wortliste/original/_alle.txt

# Nur Wörter mit S (lowercase)
curl -O https://raw.githubusercontent.com/drunkbit/wortschatz/main/wortliste/lowercase/s.txt

# Wörter mit Ü am Anfang
curl -O https://raw.githubusercontent.com/drunkbit/wortschatz/main/wortliste/original/ue.txt
```

## Wortliste selbst generieren

### Voraussetzungen

- Node.js >= 18

### Installation

```bash
cd tools
npm install
```

### Wörter aus Quellen abrufen

```bash
# Alle Quellen abrufen
npm run fetch

# Nur bestimmte Quelle
npm run fetch -- --hunspell
npm run fetch -- --wiktionary
npm run fetch -- --dwds
```

### Eigene Texte hinzufügen

Eigene Textdateien (`.txt`) im Verzeichnis `tools/input/` ablegen. Der Text-Extraktor tokenisiert den Fließtext und extrahiert einzelne Wörter automatisch.

```bash
# Texte verarbeiten
npm run extract
```

### Wortliste generieren

```bash
# Wortlisten aus allen gecachten Quellen zusammenbauen
npm run build-wordlist
```

Dies erstellt die komplette Verzeichnisstruktur unter `wortliste/` mit allen Varianten und Dateien.

## Quellen

| Quelle | Beschreibung | Lizenz |
|--------|-------------|--------|
| [Hunspell de_DE](https://github.com/wooorm/dictionaries/tree/main/dictionaries/de) | Deutsches Hunspell-Wörterbuch | GPL-2.0 / GPL-3.0 |
| [Wiktionary](https://de.wiktionary.org/) | Deutschsprachiges Wiktionary (Kategorie: Deutsch) | CC BY-SA 3.0 |
| [DWDS](https://www.dwds.de/) | Digitales Wörterbuch der deutschen Sprache | Siehe DWDS-Nutzungsbedingungen |

## Lizenz

MIT — siehe [LICENSE](LICENSE)
