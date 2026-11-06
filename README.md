# Wortschatz

Eine umfassende deutsche Wortliste zur freien Weiterverarbeitung: **über 900.000 Wörter** in acht Varianten, als Plaintext.

**Alle Befehle** (Download, Aufbau, Qualitätsprüfung, Entwicklung): **[Befehlsreferenz →](./BEFEHLE.md)**

## Varianten

| Variante               | Verzeichnis               | Beispiel   |
| ---------------------- | ------------------------- | ---------- |
| Original               | `original/`               | Übermütig  |
| Lowercase              | `lowercase/`              | übermütig  |
| Uppercase              | `uppercase/`              | ÜBERMUTIG  |
| Capitalized            | `capitalized/`            | Übermütig  |
| No-Umlauts             | `no-umlauts/`             | Uebermutig |
| No-Umlauts-Lowercase   | `no-umlauts-lowercase/`   | uebermutig |
| No-Umlauts-Uppercase   | `no-umlauts-uppercase/`   | UEBERMUTIG |
| No-Umlauts-Capitalized | `no-umlauts-capitalized/` | Uebermutig |

Pro Variante gibt es `_alle.txt` (alle Wörter) und je eine Datei pro Anfangsbuchstaben (`a`–`z`, plus `ae`, `oe`, `ue` für Umlaute).

## Format

- Plaintext (`.txt`), UTF-8, ein Wort pro Zeile
- Alphabetisch sortiert (deutsche Locale), keine exakten Duplikate
- Normalisierte Varianten zusätzlich ohne reine Groß-/Kleinschreibungs-Duplikate; `original` und `no-umlauts` behalten bewusst beide Schreibweisen (`Aal` und `aal`)

## Nutzung & Aufbau

- **Herunterladen** — fertige `curl`-Beispiele: [Befehlsreferenz](./BEFEHLE.md#wortliste-herunterladen)
- **Selbst generieren** — `cd tools && npm install`, dann `fetch` → `build-wordlist`: [Befehlsreferenz](./BEFEHLE.md#wortliste-selbst-generieren)
- **Qualitätsprüfung** — `quality` bewertet Wörter per LLM und kann die Liste direkt neu exportieren: [quality](./BEFEHLE.md#npm-run-quality)
- **Entwicklung** — Tests und Typecheck: [Entwicklung](./BEFEHLE.md#entwicklung)

## Quellen

[Hunspell de_DE](https://github.com/wooorm/dictionaries/tree/main/dictionaries/de) · [Wiktionary](https://de.wiktionary.org/) · [DWDS](https://www.dwds.de/) · Internet
