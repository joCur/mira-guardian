#!/bin/bash
# Richtet auf einem macOS-Runner die Keychain für das Signieren ein und trägt
# das eigene Zertifikat als vertrauenswürdig für Codeunterzeichnung ein.
#
# Warum nicht einfach CSC_LINK an electron-builder geben: Es importiert die
# .p12 dann selbst in eine frische Keychain — und dort gilt ein
# selbstsigniertes Zertifikat als CSSMERR_TP_NOT_TRUSTED, weil
# Vertrauenseinstellungen am Benutzer hängen und nicht an der Keychain.
# electron-builder sortiert solche Identitäten aus, meldet nur
# "skipped macOS application code signing" und baut ohne Signatur weiter.
# Zurück bleibt die Ad-hoc-Signatur des Linkers, deren Ressourcenteil macOS
# als beschädigt ansieht ("code has no resources but signature indicates they
# must be present") — eine solche App nimmt kein Update mehr an.
#
# Erwartet CERT_P12_BASE64 und CERT_PASSWORD in der Umgebung und schreibt den
# Pfad der Keychain als CSC_KEYCHAIN nach GITHUB_ENV.
set -euo pipefail

if [ -z "${CERT_P12_BASE64:-}" ]; then
  echo "CERT_P12_BASE64 ist leer — ohne Zertifikat kann nicht signiert werden." >&2
  exit 1
fi

KEYCHAIN="${RUNNER_TEMP:-/tmp}/signing.keychain-db"
KEYCHAIN_PASSWORD="$(uuidgen)"
P12="${RUNNER_TEMP:-/tmp}/cert.p12"
CER="${RUNNER_TEMP:-/tmp}/cert.pem"
IDENTITY="Guardian Code Signing"

printf '%s' "$CERT_P12_BASE64" | base64 --decode > "$P12"

rm -f "$KEYCHAIN"
security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
# Ohne Zeitsperre, sonst schließt sich die Keychain mitten im Build.
security set-keychain-settings -lut 21600 "$KEYCHAIN"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security import "$P12" -k "$KEYCHAIN" -P "$CERT_PASSWORD" \
  -T /usr/bin/codesign -T /usr/bin/security
# Ohne partition list fragt codesign interaktiv nach dem Schlüssel und hängt.
security set-key-partition-list -S apple-tool:,apple:,codesign: \
  -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN" > /dev/null
security list-keychains -d user -s "$KEYCHAIN" login.keychain-db

# Das eigene Root als vertrauenswürdig eintragen — nur für Codeunterzeichnung,
# nicht für TLS oder sonstige Zwecke.
security find-certificate -c "$IDENTITY" -p "$KEYCHAIN" > "$CER"
sudo security add-trusted-cert -d -r trustRoot -p codeSign \
  -k /Library/Keychains/System.keychain "$CER"

rm -f "$P12" "$CER"

# Muss die Identität jetzt als gültig listen. Sonst würde electron-builder
# gleich wieder stillschweigend unsigniert bauen, und das fiele erst auf,
# wenn ein Release keine Updates mehr annimmt.
security find-identity -v -p codesigning "$KEYCHAIN" > identities.txt
cat identities.txt
if ! grep -q "$IDENTITY" identities.txt; then
  echo "Identität '$IDENTITY' gilt trotz Vertrauenseintrag nicht als gültig." >&2
  rm -f identities.txt
  exit 1
fi
rm -f identities.txt

if [ -n "${GITHUB_ENV:-}" ]; then
  echo "CSC_KEYCHAIN=$KEYCHAIN" >> "$GITHUB_ENV"
fi
echo "Keychain bereit: $KEYCHAIN"
