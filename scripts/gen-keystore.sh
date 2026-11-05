#!/usr/bin/env bash
# Membuat keystore rilis + android/keystore.properties untuk signing APK.
#
# Pemakaian:
#   ./scripts/gen-keystore.sh
#   KEY_ALIAS=coffeeshop STORE_PASSWORD=rahasia ./scripts/gen-keystore.sh
#
# File yang dihasilkan TIDAK boleh di-commit (sudah ada di android/.gitignore).
# Simpan keystore + password di tempat aman: kalau hilang, update APK tidak bisa
# dipasang di atas instalasi lama (Android menolak signature berbeda).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$ROOT_DIR/android"
KEYSTORE_FILE="${KEYSTORE_FILE:-$ANDROID_DIR/release.jks}"
PROPS_FILE="$ANDROID_DIR/keystore.properties"
ALIAS="${KEY_ALIAS:-coffeeshop}"
DNAME="${KEY_DNAME:-CN=Coffee Shop POS, OU=POS, O=Kian Labs, L=Jakarta, ST=DKI Jakarta, C=ID}"
VALIDITY_DAYS="${KEY_VALIDITY_DAYS:-10000}"

command -v keytool >/dev/null 2>&1 || {
  echo "keytool tidak ditemukan. Pasang JDK 21 lalu jalankan lagi." >&2
  exit 1
}

if [[ -f "$PROPS_FILE" ]]; then
  read -r -p "$PROPS_FILE sudah ada. Timpa? (y/N) " answer
  [[ "$answer" =~ ^[yY]$ ]] || {
    echo "Dibatalkan."
    exit 1
  }
fi

if [[ -n "${STORE_PASSWORD:-}" ]]; then
  STORE_PASS="$STORE_PASSWORD"
else
  read -r -s -p "Password keystore (min 6 karakter): " STORE_PASS
  echo
  read -r -s -p "Ulangi password: " STORE_PASS_CONFIRM
  echo
  [[ "$STORE_PASS" == "$STORE_PASS_CONFIRM" ]] || {
    echo "Password tidak sama." >&2
    exit 1
  }
fi

if [[ ${#STORE_PASS} -lt 6 ]]; then
  echo "Password minimal 6 karakter." >&2
  exit 1
fi

# Java Properties memakai '=' ':' '#' '!' sebagai pemisah/komentar; hindari.
if [[ ! "$STORE_PASS" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "Password hanya boleh huruf, angka, titik, garis bawah, atau strip" >&2
  echo "(agar aman dibaca keystore.properties tanpa escaping)." >&2
  exit 1
fi

mkdir -p "$(dirname "$KEYSTORE_FILE")"

keytool -genkeypair -v \
  -keystore "$KEYSTORE_FILE" \
  -alias "$ALIAS" \
  -keyalg RSA \
  -keysize 2048 \
  -validity "$VALIDITY_DAYS" \
  -storepass "$STORE_PASS" \
  -keypass "$STORE_PASS" \
  -dname "$DNAME" \
  -noprompt

# storeFile relatif terhadap folder android/ (rootProject Gradle).
if [[ "$KEYSTORE_FILE" == "$ANDROID_DIR"/* ]]; then
  STORE_FILE_VALUE="${KEYSTORE_FILE#"$ANDROID_DIR"/}"
else
  STORE_FILE_VALUE="$KEYSTORE_FILE"
fi

umask 077
cat > "$PROPS_FILE" <<EOF
# Digenerate oleh scripts/gen-keystore.sh — JANGAN di-commit.
# storeFile relatif terhadap folder android/.
storeFile=$STORE_FILE_VALUE
storePassword=$STORE_PASS
keyAlias=$ALIAS
keyPassword=$STORE_PASS
EOF
chmod 600 "$PROPS_FILE" "$KEYSTORE_FILE"

echo
echo "Selesai:"
echo "  keystore : $KEYSTORE_FILE"
echo "  properti : $PROPS_FILE"
echo
echo "Sidik jari sertifikat (catat untuk verifikasi rilis):"
keytool -list -v -keystore "$KEYSTORE_FILE" -alias "$ALIAS" -storepass "$STORE_PASS" \
  | grep -E "SHA1:|SHA256:" || true
echo
echo "Build rilis: (cd android && ./gradlew assembleRelease)"
