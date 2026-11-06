# Befehlsreferenz

Alle Befehle zum Herunterladen, Aufbauen und Pflegen der Wortliste.
Zurück zur [Übersicht](./README.md).

| Befehl | Zweck |
| --- | --- |
| `npm run fetch` | Quellen abrufen und im Cache speichern |
| `npm run extract` | Wörter aus eigenen Texten in `tools/input/` gewinnen |
| `npm run build-wordlist` | Neue Wörter inkrementell ergänzen |
| `npm run rebuild-wordlist` | Wortliste komplett neu aufbauen |
| `npm run filter` | Zeichenregeln anwenden und neu exportieren |
| `npm run stats` | Quellen-, Überlappungs- und Cache-Statistik |
| `npm run cache-clean` | Cache löschen |
| `npm run quality` | LLM-Qualitätsprüfung, `--clean-output`, `--apply` |

## Wortliste herunterladen

Die Dateien im `wortliste/`-Verzeichnis können direkt heruntergeladen und verwendet werden.

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

Im Verzeichnis `tools/` befinden sich alle Skripte, um die Wortliste aus verschiedenen Quellen neu aufzubauen. Nach der Installation (`cd tools && npm install`) stehen die folgenden Befehle zur Verfügung. Für `npm run quality` wird zusätzlich ein OpenRouter-Schlüssel benötigt — entweder als Umgebungsvariable oder in `tools/.env` (Vorlage: `tools/.env.example`).

---

### `npm run fetch`

```bash
NAME
    fetch — Wörter aus Online-Quellen abrufen

SYNOPSIS
    npm run fetch [-- OPTIONS]

DESCRIPTION
    Ruft Wörter aus den konfigurierten Online-Quellen ab und speichert
    sie im lokalen Cache. Ohne Optionen werden alle Quellen abgerufen.
    Liefert eine Quelle keine Wörter (z. B. wegen eines API-Fehlers),
    bleibt der vorhandene Cache unverändert, damit keine Wörter verloren
    gehen.

OPTIONS
    --hunspell      Nur aus dem Hunspell-Wörterbuch abrufen
    --wiktionary    Nur aus Wiktionary abrufen
    --dwds          Nur aus DWDS abrufen
    --force         Cache neu erstellen, auch wenn er aktuell ist
```

---

### `npm run extract`

```bash
NAME
    extract — Wörter aus eigenen Texten extrahieren

SYNOPSIS
    npm run extract [-- --reset]

DESCRIPTION
    Tokenisiert Fließtext aus .txt-Dateien im Verzeichnis tools/input/
    und extrahiert einzelne Wörter automatisch. Die Dateien müssen vor
    dem Aufruf manuell in tools/input/ abgelegt werden.

    Die extrahierten Wörter werden zum bestehenden Cache ergänzt.
    Mit --reset wird der Cache der eigenen Texte neu aufgebaut.
```

---

### `npm run build-wordlist`

```bash
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

```bash
NAME
    rebuild-wordlist — Wortliste komplett neu erstellen

SYNOPSIS
    npm run rebuild-wordlist

DESCRIPTION
    Verwirft die bestehende Wortliste und erstellt sie vollständig neu
    aus allen verfügbaren Quellen und dem Cache.

    Hinweis: Der Neuaufbau nutzt ausschließlich den lokalen Cache
    (tools/cache/). Fehlt eine Quelle im Cache oder ist sie leer, fehlen
    deren Wörter anschließend in der Wortliste. Vor einem Neuaufbau
    daher mit `npm run stats` prüfen, ob alle Quellen vorhanden sind.
```

---

### `npm run filter`

```bash
NAME
    filter — Wortliste filtern

SYNOPSIS
    npm run filter [-- OPTIONS]

OPTIONS
    --dry-run       Zeigt was passieren würde, ohne Dateien zu schreiben
```

---

### `npm run stats`

```bash
NAME
    stats — Cache-Statistiken anzeigen

SYNOPSIS
    npm run stats

DESCRIPTION
    Zeigt Statistiken und das Alter der Cache-Dateien an.
```

---

### `npm run cache-clean`

```bash
NAME
    cache-clean — Cache löschen

SYNOPSIS
    npm run cache-clean

DESCRIPTION
    Löscht alle Cache-Dateien im Verzeichnis tools/cache/ —
    inklusive der Qualitäts-Journale (quality-*.jsonl).
```

---

### `npm run quality`

```bash
NAME
    quality — Wortqualität mit einem LLM bewerten

SYNOPSIS
    npm run quality [-- OPTIONS]

    Der OpenRouter-Schlüssel kommt aus der Umgebung oder aus einer
    .env-Datei (siehe UMGEBUNG):

    # Variante 1: Umgebungsvariable
    OPENROUTER_API_KEY=sk-or-... npm run quality -- --limit 100

    # Variante 2: .env-Datei
    cp tools/.env.example tools/.env    # Schlüssel eintragen
    npm run quality -- --limit 100

DESCRIPTION
    Bewertet die Wörter einer Variante (oder einer eigenen Datei) mit einem
    LLM über die OpenRouter-API. Jedes Wort erhält einen Score von 0 bis 100
    sowie Flags für Eigenname, Abkürzung und Junk. Die Ergebnisse werden
    inkrementell in tools/cache/quality-<modell>.jsonl gespeichert; ein
    erneuter Aufruf bewertet nur noch fehlende Wörter.

    Es werden ausschließlich die Wörter selbst an OpenRouter übertragen.

    Hinweis: Die aktuelle Liste umfasst rund 919.000 Wörter — bei
    --batch-size 50 sind das etwa 18.400 Anfragen. Vor einem vollständigen
    Lauf mit --dry-run und einem kleinen --limit testen.

    Score-Bedeutung:
      90–100  korrektes, gebräuchliches deutsches Wort
      70–89   gültig, aber selten/fachlich/stark gebeugt/veraltet
      50–69   fragwürdig (Eigenname, Abkürzung, fremdsprachig)
      0–49    kein deutsches Wort, Tippfehler, OCR-/HTML-Artefakt

    Batch-Größe: Die Eingabe ist unkritisch (1000 Wörter ≈ 3.100
    Eingabe-Tokens), die Antwort ist der Engpass. Gemessen pro Wort:
      ausführlich  ≈ 45 Ausgabe-Tokens (inkl. Begründung und Wortart)
      --compact ≈ 22 Ausgabe-Tokens (Wort, Flags, Konfidenz)
    Faustregel: bis ca. 50 Wörter ausführlich, bis ca. 500 Wörter nur mit
    --compact (500 Wörter ≈ 11.500 Ausgabe-Tokens). Unvollständige oder
    unbrauchbare Antworten werden einmal wiederholt und dann automatisch
    halbiert, bis alle Wörter bewertet sind (abschaltbar mit --no-split).
    Netz- und HTTP-Fehler werden dagegen bis --max-retries wiederholt.

    Reasoning: Modelle mit Denkphase (z. B. inclusionai/ling-3.*) geben
    ihr Ausgabebudget zuerst fürs Reasoning aus und liefern dann eine
    leere Antwort. Deshalb ist Reasoning standardmäßig deaktiviert
    (--reasoning off) — das spart außerdem Geld und Zeit. Wer es will:
    --reasoning low|medium|high oder auto (Modell entscheidet).

    Anwenden: Mit --apply wird die bereinigte Liste (Score >= --min-score,
    kein Junk, optional ohne Eigennamen/Abkürzungen) als neue Wortliste
    nach wortliste/ exportiert — alle acht Varianten. --apply ruft die API
    nicht auf, sondern arbeitet nur mit den gespeicherten Bewertungen: erst
    bewerten, dann anwenden. Das überschreibt die eingecheckten Listen,
    daher vorher mit --dry-run prüfen. Solange Wörter unbewertet sind,
    bricht --apply ab; mit --force werden sie bewusst verworfen.
    Funktioniert nur mit --variant original.

OPTIONS
    --variant <name>          Wortlisten-Variante (Standard: original)
    --input <datei>           Eigene Liste (eine Zeile pro Wort)
    --model <id>              OpenRouter-Modell
                              (Standard: $OPENROUTER_MODEL oder openai/gpt-4o-mini)
    --batch-size <n>          Wörter pro Anfrage, 1–1000 (Standard: 50)
    --concurrency <n>         Parallele Anfragen, 1–100 (Standard: 2)
    --max-retries <n>         Wiederholungen bei Netz-/HTTP-Fehlern (Standard: 3)
    --max-tokens <n>          Max. Ausgabe-Tokens (Standard: geschätzt)
    --compact                 Kompaktes Antwortschema (~80 % weniger Tokens)
    --reasoning <modus>       Reasoning steuern: off, low, medium, high,
                              auto (Standard: off)
    --no-split                Abgeschnittene Antworten nicht automatisch aufteilen
    --limit <n>               Höchstens n neue Wörter bewerten
    --output <datei>          Vollständigen JSON-Bericht schreiben
    --clean-output <datei>    Wörter mit Score >= --min-score schreiben
    --min-score <n>           Mindest-Score für --clean-output (Standard: 80)
    --exclude-proper-nouns    Eigennamen aus der sauberen Liste entfernen
    --exclude-abbreviations   Abkürzungen aus der sauberen Liste entfernen
    --apply                   Bereinigte Liste als neue Wortliste exportieren
    --force                   Mit --apply auch bei unbewerteten Wörtern exportieren
    --dry-run                 Nichts schreiben, keine API-Aufrufe (Vorschau,
                              auch für --apply)
    --reset                   Vorhandene Bewertungen für das Modell verwerfen

UMGEBUNG
    OPENROUTER_API_KEY        Erforderlich (außer bei --dry-run)
    OPENROUTER_MODEL          Standardmodell
    OPENROUTER_BASE_URL       Alternative API-Basis-URL

    Diese Variablen können statt in der Umgebung auch in einer .env-Datei
    stehen. Geladen werden der Reihe nach .env im aktuellen Verzeichnis,
    tools/.env und .env im Projektstamm — bei mehreren Dateien gewinnt die
    erste, und bereits gesetzte Umgebungsvariablen haben immer Vorrang.
    Vorlage zum Kopieren: tools/.env.example.

BEISPIELE
    # Aufwand schätzen
    npm run quality -- --dry-run

    # Erste 500 Wörter bewerten und Bericht schreiben
    npm run quality -- --limit 500 --output tools/quality-report.json

    # 500 Wörter pro Anfrage (kompakt) — spart Requests und Kosten
    npm run quality -- --batch-size 500 --compact --concurrency 1

    # Bereinigte Liste ohne Eigennamen und Abkürzungen erzeugen
    npm run quality -- \
      --min-score 85 --exclude-proper-nouns --exclude-abbreviations \
      --clean-output tools/clean.txt

    # Wortliste anwenden: erst Vorschau, dann exportieren
    npm run quality -- --min-score 85 --exclude-proper-nouns --apply --dry-run
    npm run quality -- --min-score 85 --exclude-proper-nouns --apply
```

## Entwicklung

```bash
cd tools
npm install
npm test              # Unit-Tests + Prüfung der eingecheckten Wortliste
npm run typecheck     # TypeScript ohne Ausgabe prüfen
```

Die Tests prüfen neben der Pipeline auch die eingecheckten Wortlisten:
Sortierung, Duplikatfreiheit, gültige Zeichen sowie die Übereinstimmung
von `_alle.txt` und den Buchstaben-Dateien. Bei jedem Push und Pull
Request laufen Tests und Typecheck automatisch über GitHub Actions.
