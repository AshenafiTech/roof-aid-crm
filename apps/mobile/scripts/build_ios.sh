#!/usr/bin/env bash
# Roof-Aid mobile — iOS build prep.
#
# Run this once on the borrowed Mac to install Dart + CocoaPods deps
# and generate the Xcode workspace. After it finishes you open the
# workspace in Xcode, set your signing team, plug in the iPhone, and
# hit Run.
#
# See IOS_BUILD_GUIDE.md for the full step-by-step walkthrough.

set -e

# ── Pretty output ─────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

info() { printf "${GREEN}➜${NC} %s\n" "$1"; }
warn() { printf "${YELLOW}⚠${NC}  %s\n" "$1"; }
err()  { printf "${RED}✖${NC}  %s\n" "$1"; }

# ── Sanity checks ─────────────────────────────────────────────
if [[ "$OSTYPE" != "darwin"* ]]; then
  err "This script must run on macOS. iOS builds require Xcode, which is Mac-only."
  exit 1
fi

if ! command -v flutter &> /dev/null; then
  err "Flutter SDK not found in PATH."
  echo "    Install: https://docs.flutter.dev/get-started/install/macos"
  echo "    Or via Homebrew: brew install --cask flutter"
  exit 1
fi

if ! command -v pod &> /dev/null; then
  err "CocoaPods not found."
  echo "    Install: brew install cocoapods"
  echo "    Or: sudo gem install cocoapods"
  exit 1
fi

if ! command -v xcodebuild &> /dev/null; then
  err "Xcode command-line tools not found."
  echo "    Install: sudo xcode-select --install"
  echo "    Make sure Xcode is also installed from the App Store."
  exit 1
fi

# ── Move to project root ──────────────────────────────────────
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR/.."

printf "\n${BOLD}Roof-Aid iOS build prep${NC}\n"
printf "Working directory: $(pwd)\n\n"

# ── Pre-flight: assets/.env ───────────────────────────────────
if [[ ! -f "assets/.env" ]]; then
  warn "assets/.env is missing."
  echo "    Copy your existing .env file (Supabase URL + anon key) here"
  echo "    before running the app. Without it the app will fail at login."
  echo ""
fi

# ── Pre-flight: Google Maps iOS key ───────────────────────────
if grep -q "REPLACE_WITH_GOOGLE_MAPS_IOS_KEY" ios/Runner/Info.plist 2>/dev/null; then
  warn "Google Maps iOS key is still a placeholder in ios/Runner/Info.plist."
  echo "    The Map view will not render until you replace it with a real key"
  echo "    from Google Cloud Console (Maps SDK for iOS, restricted to your"
  echo "    bundle id). Safe to skip if you're not testing the map for this run."
  echo ""
fi

# ── Steps ─────────────────────────────────────────────────────
info "Cleaning previous build artefacts..."
flutter clean

info "Fetching Dart dependencies..."
flutter pub get

info "Installing CocoaPods (this can take a few minutes the first time)..."
cd ios
# `pod install` reads Podfile.lock; if a Podfile doesn't exist yet,
# Flutter generates it via `flutter build ios` first.
if [[ ! -f "Podfile" ]]; then
  warn "Podfile not found — running 'flutter build ios --no-codesign' first to generate it..."
  cd ..
  flutter build ios --no-codesign --debug || true
  cd ios
fi
pod install
cd ..

info "Running flutter doctor..."
flutter doctor

# ── Done ──────────────────────────────────────────────────────
printf "\n${GREEN}${BOLD}✓ Build prep complete${NC}\n\n"
printf "${BOLD}Next steps:${NC}\n"
printf "  1. open ios/Runner.xcworkspace          ${GREEN}# NOT .xcodeproj${NC}\n"
printf "  2. In Xcode: Runner target → Signing & Capabilities → set your Team\n"
printf "  3. Plug in the iPhone via USB cable\n"
printf "  4. Trust the computer on the iPhone when prompted\n"
printf "  5. Top of Xcode → device dropdown → pick the iPhone\n"
printf "  6. Click ▶  (or press Cmd+R)\n\n"
printf "Or run from terminal once the device is connected:\n"
printf "  ${BOLD}flutter run --release${NC}\n\n"
printf "Full walkthrough: IOS_BUILD_GUIDE.md\n"
