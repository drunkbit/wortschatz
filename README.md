# Wortschatz

Eine umfassende deutsche Wortliste zur freien Weiterverarbeitung.

Die Wörter stammen aus [mehreren Quellen](#quellen) und werden in sechs Varianten bereitgestellt:

| Variante | Verzeichnis | Beschreibung | Beispiel |
|----------|-------------|--------------|----------|
| **Original** | `original/` | Groß-/Kleinschreibung wie im Wörterbuch | Übermütig |
| **Lowercase** | `lowercase/` | Alles kleingeschrieben | übermütig |
| **Uppercase** | `uppercase/` | Alles großgeschrieben | ÜBERMÜTIG |
| **No-Umlauts** | `no-umlauts/` | Umlaute ersetzt (ä→ae, ö→oe, ü→ue, ß→ss) | Uebermutig |
| **No-Umlauts-Lowercase** | `no-umlauts-lowercase/` | Umlaute ersetzt + lowercase | uebermutig |
| **Capitalized** | `capitalized/` | Erster Buchstabe groß, Rest klein | Übermütig |

Alle Varianten gibt es als **eine Gesamtdatei** (`_alle.txt`) und **aufgeteilt nach Anfangsbuchstabe** (a–z + ae, oe, ue für Umlaute).

## Format

- **Plaintext** (`.txt`), UTF-8
- Ein Wort pro Zeile
- Alphabetisch sortiert (deutsche Locale)
- Keine Duplikate innerhalb einer Datei (nicht case-sensitive)

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

# Alle Wörter ohne Umlaute (lowercase)
curl -O https://raw.githubusercontent.com/drunkbit/wortschatz/main/wortliste/no-umlauts-lowercase/_alle.txt

# Alle Wörter großgeschrieben
curl -O https://raw.githubusercontent.com/drunkbit/wortschatz/main/wortliste/uppercase/_alle.txt
```

## Wortliste selbst generieren

### Installation

```bash
cd tools && npm install
```

### Wörter aus Quellen abrufen

Alle Quellen:

```bash
npm run fetch
```

Nur eine bestimmte Quelle:

```bash
npm run fetch -- --hunspell
```

```bash
npm run fetch -- --wiktionary
```

```bash
npm run fetch -- --dwds
```

### Eigene Texte hinzufügen

Eigene Textdateien (`.txt`) im Verzeichnis `tools/input/` ablegen. Der Text-Extraktor tokenisiert den Fließtext und extrahiert einzelne Wörter automatisch.

```bash
npm run extract
```

### Wortliste generieren

Nur neue Wörter zur bestehenden Liste ergänzen:

```bash
npm run build-wordlist
```

Wortliste komplett neu erstellen:

```bash
npm run rebuild-wordlist
```

Ohne `--rebuild` werden nur Wörter hinzugefügt, die noch nicht in der bestehenden Liste enthalten sind. Existiert noch keine Wortliste, wird sie automatisch neu erstellt.

## Quellen

| Quelle | Beschreibung |
|--------|-------------|
| [Hunspell de_DE](https://github.com/wooorm/dictionaries/tree/main/dictionaries/de) | Deutsches Hunspell-Wörterbuch |
| [Wiktionary](https://de.wiktionary.org/) | Deutschsprachiges Wiktionary (Kategorie: Deutsch) |
| [DWDS](https://www.dwds.de/) | Digitales Wörterbuch der deutschen Sprache |
| Internet | Diverse Webseiten und Ressourcen |
