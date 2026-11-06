# Wortschatz

Eine umfassende deutsche Wortliste zur freien Weiterverarbeitung: **über 900.000 Wörter** in acht Varianten, als Plaintext.

**Alle Befehle** (Download, Aufbau, Qualitätsprüfung, Entwicklung): **[Befehlsreferenz →](./BEFEHLE.md)**

## Varianten

| Variante               | Ordner                                                         | Gesamtdatei                                                | Beispiel   |
| ---------------------- | -------------------------------------------------------------- | ---------------------------------------------------------- | ---------- |
| Original               | [original/](./wortliste/original/)                             | [\_alle.txt](./wortliste/original/_alle.txt)               | Übermütig  |
| Lowercase              | [lowercase/](./wortliste/lowercase/)                           | [\_alle.txt](./wortliste/lowercase/_alle.txt)              | übermütig  |
| Uppercase              | [uppercase/](./wortliste/uppercase/)                           | [\_alle.txt](./wortliste/uppercase/_alle.txt)              | ÜBERMUTIG  |
| Capitalized            | [capitalized/](./wortliste/capitalized/)                       | [\_alle.txt](./wortliste/capitalized/_alle.txt)            | Übermütig  |
| No-Umlauts             | [no-umlauts/](./wortliste/no-umlauts/)                         | [\_alle.txt](./wortliste/no-umlauts/_alle.txt)             | Uebermutig |
| No-Umlauts-Lowercase   | [no-umlauts-lowercase/](./wortliste/no-umlauts-lowercase/)     | [\_alle.txt](./wortliste/no-umlauts-lowercase/_alle.txt)   | uebermutig |
| No-Umlauts-Uppercase   | [no-umlauts-uppercase/](./wortliste/no-umlauts-uppercase/)     | [\_alle.txt](./wortliste/no-umlauts-uppercase/_alle.txt)   | UEBERMUTIG |
| No-Umlauts-Capitalized | [no-umlauts-capitalized/](./wortliste/no-umlauts-capitalized/) | [\_alle.txt](./wortliste/no-umlauts-capitalized/_alle.txt) | Uebermutig |

In jedem Ordner liegt `_alle.txt` (alle Wörter) sowie je eine Datei pro Anfangsbuchstaben (`a`–`z`, plus `ae`, `oe`, `ue` für Umlaute).

## Format

- Plaintext (`.txt`), UTF-8, ein Wort pro Zeile
- Alphabetisch sortiert (deutsche Locale), keine exakten Duplikate
- Normalisierte Varianten zusätzlich ohne reine Groß-/Kleinschreibungs-Duplikate; `original` und `no-umlauts` behalten bewusst beide Schreibweisen (`Aal` und `aal`)

## Nutzung & Aufbau

- **Herunterladen** — alle Dateien liegen in [wortliste/](./wortliste/); fertige `curl`-Beispiele: [Befehlsreferenz](./BEFEHLE.md#wortliste-herunterladen)
- **Selbst generieren** — `cd tools && npm install`, dann `fetch` → `build-wordlist`: [Befehlsreferenz](./BEFEHLE.md#wortliste-selbst-generieren)
- **Qualitätsprüfung** — `quality` bewertet Wörter per LLM und kann die Liste direkt neu exportieren: [quality](./BEFEHLE.md#npm-run-quality)
- **Entwicklung** — Tests und Typecheck: [Entwicklung](./BEFEHLE.md#entwicklung)

## Quellen

[Hunspell de_DE](https://github.com/wooorm/dictionaries/tree/main/dictionaries/de) · [Wiktionary](https://de.wiktionary.org/) · [DWDS](https://www.dwds.de/) · Internet
