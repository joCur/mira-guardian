# Versionsanzeige in App und Server-Log

**Datum:** 2026-07-28
**Status:** Abgestimmt
**Bereich:** `apps/widget`, `apps/server`, `.github/workflows/release.yml`

## Problem

Es ist von außen nicht erkennbar, welcher Stand läuft.

Die Version entsteht ausschließlich in der CI als `0.1.<Build-Nummer>`; im Repo
steht in jeder `package.json` unverändert `0.1.0`. Für die Desktop-App patcht
der Release-Workflow `apps/widget/package.json` vor dem Bauen, `app.getVersion()`
liefert dort also die echte Version — sie wird nur nirgends angezeigt. Beim
Server landet die Version **nur im Docker-Tag**: der laufende Prozess kennt sie
nicht und kann sie folglich auch nicht ins Log schreiben.

Praktische Folge: Nach einem Server-Update lässt sich nicht feststellen, ob die
installierte App zum Server passt. Genau diese Frage kam beim Deployment am
28.07.2026 auf und war nur durch einen Blick in die Datenbank zu beantworten.

## Versionsquelle für den Server

Gewählt: **Build-Argument im Dockerfile, das zu einer Umgebungsvariablen wird.**

```dockerfile
ARG VERSION=0.0.0-dev
ENV GUARDIAN_BUILD_VERSION=$VERSION
```

`ARG` und `ENV` stehen als letzte Zeilen der Runtime-Stufe. Damit wertet Docker
das Argument erst am Ende aus und der Build-Cache der CI bleibt für alles
darüber erhalten — insbesondere für `pnpm install`.

Verworfen wurde, analog zum Widget die `apps/server/package.json` in der CI zu
patchen: Diese Datei wird im Dockerfile früh kopiert, noch vor `pnpm install`.
Jeder Release hätte damit den Cache gebrochen und die Abhängigkeiten neu
installiert — ein hoher Preis für die Symmetrie zum Widget.

Ebenfalls verworfen: ein reines OCI-Label am Image. Sauber für die Registry,
aber ein Prozess kann sein eigenes Label nicht lesen, und damit wäre die
verlangte Log-Zeile nicht machbar.

Der Standardwert `0.0.0-dev` gilt für lokale Builds und die Entwicklung. Er ist
absichtlich als solcher erkennbar, damit ein „dev" im Log nicht mit einem
Release verwechselt wird.

> **Korrektur nach dem ersten Rollout:** Die Variable hieß zunächst
> `GUARDIAN_VERSION`. Dieser Name gehört aber schon dem Deployment, das damit
> den Image-Tag wählt (`deploy/docker-compose.yml`), und `env_file: .env` lädt
> dieselbe Datei komplett in den Container. Der Tag-Wert überschrieb damit die
> Angabe aus dem Image: bei `GUARDIAN_VERSION=latest` loggte der Server
> `guardian-server latest`, und das Widget zeigte „latest" als Server-Version.
>
> Deshalb `GUARDIAN_BUILD_VERSION`. Die Trennung ist inhaltlich richtig und
> nicht bloß eine Ausweichbenennung: der Tag sagt, welches Image geholt wird,
> die gebaute Version sagt, was darin steckt. Bei `latest` fallen die beiden
> zwangsläufig auseinander — und genau dann ist die Angabe interessant.
>
> Allgemein: Was der Server aus der Umgebung liest, darf niemals so heißen wie
> etwas, das im Deployment nur zur Interpolation dient.

## Server

`GUARDIAN_BUILD_VERSION` kommt als optionaler Wert mit Standard in die Konfiguration,
wie alle anderen Einstellungen auch. Zwei Verwendungen:

- **Startzeile im Log:** `guardian-server 0.1.9 hört auf :4000`. Bewusst die
  bestehende Zeile erweitern statt eine zweite hinzuzufügen — der Start soll
  knapp bleiben.
- **`/health`:** liefert `{ ok: true, version: "0.1.9" }`. Der Endpunkt ist
  unauthentifiziert und wird schon für den Docker-Healthcheck genutzt; die
  Version dort mitzugeben macht sie auch für Monitoring sichtbar.

Der Release-Workflow übergibt `build-args: VERSION=<version>` an die
Container-Aktion.

## Widget

Die eigene Version wird **beim Bauen eingebacken**: `electron.vite.config.ts`
liest die `package.json` und setzt sie über `define` als `__APP_VERSION__` in
den Main-Prozess. Eine neue Bridge-Funktion `getAppVersion()` gibt sie an den
Renderer weiter. Die Server-Version holt der `ApiClient` von `/health`.

> **Korrektur nach der ersten Verifikation:** Zuerst war `app.getVersion()` als
> Quelle vorgesehen. In der echten App stand daraufhin `Widget 36.9.5` — die
> Electron-Version. `app.getVersion()` sucht die `package.json` der App und
> fällt ohne sie stillschweigend auf die Electron-Version zurück; was
> herauskommt, hängt also davon ab, wie die App gestartet wurde. Eine
> Build-Zeit-Konstante ist in jedem Startmodus dieselbe. Die Release-Pipeline
> patcht die `package.json` weiterhin vor dem Bauen, also bleibt der Wert
> korrekt.

Angezeigt wird beides im Hüter-Tab als eigener Abschnitt unter „Verbindung" —
dort stehen schon Server-Adresse und Abmelden, also die technischen Angaben.

```
┌─ VERBINDUNG ─────────────────────────────┐
│ http://svl-curth…:4000        [Abmelden] │
│ Adresse des Guardian-Servers. Sie …      │
│                                          │
│ VERSION                                  │
│ Widget 0.1.9 · Server 0.1.9              │
└──────────────────────────────────────────┘
```

### Die drei Zustände

| Lage | Anzeige |
|---|---|
| Beide Versionen gleich | `Widget 0.1.9 · Server 0.1.9`, ohne weiteren Hinweis |
| Versionen verschieden | derselbe Text, dazu ein gelber Hinweis, dass die Stände auseinanderlaufen |
| Server nicht erreichbar oder ohne Versionsangabe | `Widget 0.1.9 · Server unbekannt` |
| Eigene Version noch nicht geladen | `Widget unbekannt · Server 0.1.9` |

Die letzten beiden Zustände sind keine Randfälle. Beim Rollout trifft eine neue
App zwangsläufig auf einen Server, dessen `/health` noch keine Version liefert,
und die eigene Version wird asynchron nachgeladen. In beiden Fällen ist nur eine
Seite bekannt — das sagt nichts darüber, ob die Stände zusammenpassen. Der
Hinweis erscheint deshalb ausschließlich, wenn **beide** Versionen bekannt und
verschieden sind.

Gelb ist in der App die Farbe für „schau hin" (Klärungsbedarf) und damit hier
richtig: ein Versionsunterschied ist ein Hinweis, kein Fehler.

## Nicht-Ziele

- **Kein Auto-Update und keine Update-Aufforderung.** Der Hinweis stellt fest,
  dass die Stände auseinanderlaufen; wie aktualisiert wird, steht im Release.
- **Keine Versionsprüfung, die Funktionen sperrt.** Die App bleibt bei
  abweichenden Ständen voll benutzbar.
- **Kein Umstellen des Versionsschemas.** `0.1.<Build-Nummer>` aus der CI bleibt
  wie es ist.
- **Keine Version im Toast-Fenster oder im Erst-Setup.**

## Tests

**Server**
- Konfiguration: Standardwert `0.0.0-dev`, wenn `GUARDIAN_BUILD_VERSION` fehlt; der
  gesetzte Wert wird übernommen.
- `/health` enthält die Version.

**Widget**
- Hüter-Tab in allen vier Zuständen: gleich (kein Hinweis), verschieden
  (Hinweis), Server ohne Versionsangabe und eigene Version noch nicht geladen
  (beide „unbekannt", kein Hinweis).
- `ApiClient`: `/health` wird gelesen, eine fehlende Version ergibt `null`.

**Abschließend** Verifikation in der echten Electron-App gegen einen Server mit
gleicher und einen mit abweichender Version, dazu ein Container-Bau mit und ohne
`VERSION`-Argument.
