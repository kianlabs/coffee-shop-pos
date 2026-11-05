#!/usr/bin/env bash
# Build APK debug: sinkronkan web assets, lalu Gradle dengan JDK 21.
#
# Gradle/AGP gagal di JDK 24+ (JdkImageTransform → jlink), jadi skrip ini
# mencari JDK 21 sendiri: $JAVA_HOME → ~/.local/jdk-21* → /usr/lib/jvm/*21*.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

find_jdk21() {
  if [[ -n "${JAVA_HOME:-}" && -x "${JAVA_HOME}/bin/javac" ]]; then
    if "${JAVA_HOME}/bin/java" -version 2>&1 | grep -q '"21\.'; then
      echo "$JAVA_HOME"
      return 0
    fi
  fi
  for candidate in "$HOME"/.local/jdk-21* /usr/lib/jvm/*21*; do
    if [[ -x "$candidate/bin/javac" ]]; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

JDK="$(find_jdk21 || true)"
if [[ -z "$JDK" ]]; then
  cat >&2 <<'EOF'
JDK 21 tidak ditemukan.
Unduh sekali saja:
  mkdir -p ~/.local && cd ~/.local
  curl -sL -o jdk21.tar.gz "https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse"
  tar xzf jdk21.tar.gz && rm jdk21.tar.gz
Lalu jalankan skrip ini lagi.
EOF
  exit 1
fi

echo "==> JDK: $JDK"
cd "$ROOT"
npm run android:assets

echo "==> Gradle assembleDebug"
cd "$ROOT/android"
JAVA_HOME="$JDK" ./gradlew assembleDebug

APK="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
echo "==> APK: $APK"
ls -lh "$APK"
