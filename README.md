# Wortschatz

Eine umfassende deutsche Wortliste zur freien Weiterverarbeitung.

Die Wörter stammen aus [mehreren Quellen](#quellen) und werden in acht Varianten bereitgestellt:

| Variante | Verzeichnis | Beschreibung | Beispiel |
| --- | --- | --- | --- |
| **Original** | `original/` | Groß-/Kleinschreibung wie im Wörterbuch | Übermütig |
| **Lowercase** | `lowercase/` | Alles kleingeschrieben | übermütig |
| **Uppercase** | `uppercase/` | Alles großgeschrieben | ÜBERMÜTIG |
| **Capitalized** | `capitalized/` | Erster Buchstabe groß, Rest klein | Übermütig |
| **No-Umlauts** | `no-umlauts/` | Umlaute ersetzt (ä→ae, ö→oe, ü→ue, ß→ss) | Uebermutig |
| **No-Umlauts-Lowercase** | `no-umlauts-lowercase/` | Umlaute ersetzt + lowercase | uebermutig |
| **No-Umlauts-Uppercase** | `no-umlauts-uppercase/` | Umlaute ersetzt + uppercase | UEBERMUTIG |
| **No-Umlauts-Capitalized** | `no-umlauts-capitalized/` | Umlaute ersetzt + erster Buchstabe groß | Uebermutig |

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

Im Verzeichnis `tools/` befinden sich alle Skripte, um die Wortliste aus verschiedenen Quellen neu aufzubauen. Nach der Installation (`cd tools && npm install`) stehen die folgenden Befehle zur Verfügung:

---

### `npm run fetch`

```
NAME
    fetch — Wörter aus Online-Quellen abrufen

SYNOPSIS
    npm run fetch [-- OPTIONS]

DESCRIPTION
    Ruft Wörter aus den konfigurierten Online-Quellen ab und speichert
    sie im lokalen Cache. Ohne Optionen werden alle Quellen abgerufen.

OPTIONS
    --hunspell      Nur aus dem Hunspell-Wörterbuch abrufen
    --wiktionary    Nur aus Wiktionary abrufen
    --dwds          Nur aus DWDS abrufen
    --force         Cache neu erstellen, auch wenn er aktuell ist
```

---

### `npm run extract`

```
NAME
    extract — Wörter aus eigenen Texten extrahieren

SYNOPSIS
    npm run extract

DESCRIPTION
    Tokenisiert Fließtext aus .txt-Dateien im Verzeichnis tools/input/
    und extrahiert einzelne Wörter automatisch. Die Dateien müssen vor
    dem Aufruf manuell in tools/input/ abgelegt werden.
```

---

### `npm run build-wordlist`

```
NAME
    build-wordlist — Wortliste inkrementell aktualisieren

SYNOPSIS
    npm run build-wordlist [-- OPTIONS]

DESCRIPTION
    Ergänzt nur neue Wörter zur bestehenden Wortliste. Vorhandene
    Einträge bleiben unverändert.

OPTIONS
    --dry-run       Zeigt was passieren würde, ohne Dateien zu schreiben
```

---

### `npm run rebuild-wordlist`

```
NAME
    rebuild-wordlist — Wortliste komplett neu erstellen

SYNOPSIS
    npm run rebuild-wordlist

DESCRIPTION
    Verwirft die bestehende Wortliste und erstellt sie vollständig neu
    aus allen verfügbaren Quellen und dem Cache.
```

---

### `npm run filter`

```
NAME
    filter — Wortliste filtern

SYNOPSIS
    npm run filter [-- OPTIONS]

OPTIONS
    --dry-run       Zeigt was passieren würde, ohne Dateien zu schreiben
```

---

### `npm run stats`

```
NAME
    stats — Cache-Statistiken anzeigen

SYNOPSIS
    npm run stats

DESCRIPTION
    Zeigt Statistiken und das Alter der Cache-Dateien an.
```

---

### `npm run cache-clean`

```
NAME
    cache-clean — Cache löschen

SYNOPSIS
    npm run cache-clean

DESCRIPTION
    Löscht alle Cache-Dateien im Verzeichnis tools/cache/.
```

## Quellen

| Quelle | Beschreibung |
| --- | --- |
| [Hunspell de_DE](https://github.com/wooorm/dictionaries/tree/main/dictionaries/de) | Deutsches Hunspell-Wörterbuch |
| [Wiktionary](https://de.wiktionary.org/) | Deutschsprachiges Wiktionary (Kategorie: Deutsch) |
| [DWDS](https://www.dwds.de/) | Digitales Wörterbuch der deutschen Sprache |
| Internet | Diverse Webseiten und Ressourcen |
