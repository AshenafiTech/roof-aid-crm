# iOS Build Guide — Roof-Aid Mobile

End-to-end recipe for **building the app on a borrowed Mac and
running it on an iPhone over USB**, with no Apple Developer Program
fee. Everything in this file runs on the Mac; nothing on your Linux
machine.

> **What you get:** the app working on the iPhone, signed with a free
> personal cert. **It will stop working after 7 days** — plug the
> phone back into the Mac and re-run to refresh.
>
> **What you don't get (for that you'd need Apple Dev Program, $99/yr):**
> remote distribution, TestFlight, App Store, ad-hoc OTA links, builds
> that last more than a week.

---

## 0. Prerequisites — what to verify before you sit at the Mac

| Thing | Where | Why |
|---|---|---|
| **macOS 13+ (Ventura)** on the Mac | About This Mac | Required by current Xcode |
| **~25 GB free disk** | About This Mac → Storage | Xcode + simulators + pods are bulky |
| **Free Apple ID** | appleid.apple.com | The free signing cert is tied to it |
| **iPhone running iOS 13+** | Settings → General → About | Our minimum deployment target |
| **USB-C → Lightning** (or USB-C → USB-C) cable | — | Wireless install isn't reliable for the first cert trust |
| **iPhone passcode** | — | Apple requires it to install dev builds |
| **The project's `assets/.env` file** | Bring on a USB stick / iCloud / email | Has Supabase URL + anon key |

---

## 1. One-time Mac setup (~1 hour, mostly downloads)

### 1.1 Install Xcode

App Store → search **Xcode** → Get → wait (~10 GB).

Open Xcode at least once → accept the licence prompt → "Install
additional required components" if asked.

Then in Terminal:

```bash
sudo xcode-select --install     # command-line tools
sudo xcodebuild -license accept # accept the license headlessly
```

### 1.2 Install Homebrew (if not already there)

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Follow the on-screen instructions to add brew to your PATH (the
script tells you the exact line for `~/.zprofile`).

### 1.3 Install Flutter SDK + CocoaPods

```bash
brew install --cask flutter
brew install cocoapods
```

Verify:

```bash
flutter --version
pod --version
```

Then:

```bash
flutter doctor
```

Address any **red ✗** lines it shows (usually missing Xcode license
or missing iOS toolchain bits). Yellow `!` lines are OK to leave for
now.

### 1.4 Sign your free Apple ID into Xcode

Xcode → **Settings…** → **Accounts** → **+** → **Apple ID** → sign
in. This adds your "Personal Team" — the free signing identity that
makes 7-day USB installs possible.

---

## 2. Get the project onto the Mac

### 2.1 Clone

```bash
cd ~/Documents          # or wherever you want it
git clone <repo-url> roof-aid-crm
cd roof-aid-crm/apps/mobile
```

### 2.2 Drop in the `.env`

Copy the **same `assets/.env`** you've been using on Linux into
`apps/mobile/assets/.env` on the Mac. It must have at least:

```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGc…
GOOGLE_MAPS_API_KEY=…   # Android key, harmless on iOS
```

### 2.3 (Optional) Google Maps iOS key

If you want the Map tab to render on iOS:

1. Google Cloud Console → APIs & Services → **Maps SDK for iOS**
   → Enable.
2. Credentials → Create API Key → restrict by your bundle id (see
   step 3.2 below for what your bundle id ends up being).
3. Open `ios/Runner/Info.plist`, find `GMSApiKey`, replace
   `REPLACE_WITH_GOOGLE_MAPS_IOS_KEY` with the key value.

**Safe to skip** if you're not testing the map view in this round —
the rest of the app works fine.

---

## 3. Run the prep script

```bash
bash scripts/build_ios.sh
```

This does:

- `flutter clean`
- `flutter pub get`
- `pod install` (inside `ios/`) — first run downloads ~500 MB of pods,
  takes 5–10 min depending on bandwidth
- `flutter doctor` — sanity check at the end

When it finishes you'll see *"✓ Build prep complete"* and a numbered
list of next steps. Continue with section 4.

---

## 4. Open the Xcode workspace + configure signing

### 4.1 Open the workspace

```bash
open ios/Runner.xcworkspace
```

⚠️ **`.xcworkspace`**, not `.xcodeproj`. CocoaPods needs the
workspace; opening the xcodeproj will fail to link.

### 4.2 Set your signing team + unique bundle id

In Xcode left sidebar (Project Navigator):

1. Click the top-level **Runner** entry.
2. In the centre pane, **Targets** → **Runner**.
3. Tab: **Signing & Capabilities**.
4. **Team:** pick *"Your Name (Personal Team)"* from the dropdown.
5. **Bundle Identifier:** change `com.example.roofAidCrm` → something
   globally unique like `com.<yourname>.roofaid`. Apple requires
   bundle ids to be globally unique even for dev installs.
6. The yellow warning should clear and Xcode should generate a
   provisioning profile automatically (look for *"Signing
   Certificate: Apple Development: …"*).

If it gets stuck on *"No matching provisioning profile"*, hit the
**Try Again** button or untick/re-tick **Automatically manage
signing**.

---

## 5. Connect the iPhone

### 5.1 Plug in

USB cable → iPhone → Mac. The iPhone shows *"Trust This Computer?"*
→ tap **Trust** → enter passcode.

### 5.2 First-time device prep (iOS-version-dependent)

If this iPhone has an iOS version Xcode hasn't seen yet, Xcode shows
*"Preparing iPhone for development"* in the device status. Let it
finish — can take 5–10 min the first time per iOS version. Don't
unplug.

### 5.3 Verify the device appears

Top toolbar of Xcode, immediately left of the ▶ play button, the
target dropdown. Should now list the iPhone's name (e.g. *"John's
iPhone"*) under **iOS Device**. Select it.

---

## 6. Run it

### 6.1 Press ▶ (or Cmd+R)

Xcode compiles → installs → launches on the iPhone.

- **First build is slow** (5–15 min — Swift + 60+ pods compile from
  scratch).
- Subsequent builds are fast (~30 s).

### 6.2 Trust the developer profile (first launch only)

The first time you open the app, iOS will refuse with *"Untrusted
Developer"*. On the iPhone:

1. **Settings → General → VPN & Device Management** (older iOS:
   *Profiles & Device Management*)
2. Under **Developer App**, tap your Apple ID.
3. Tap **Trust "[Your Apple ID]"** → confirm.
4. Tap the **Roof-Aid** icon on the home screen — opens normally.

You only do this once per Apple ID per device.

---

## 7. Handing the iPhone back

The app will keep running on the iPhone for **7 days** from the
install. After that it crashes on launch.

To extend: connect the iPhone back to this Mac, run `flutter run` or
hit ▶ in Xcode again — it re-installs with a fresh 7-day window.

---

## Optional: run from the terminal instead of Xcode

Once the device is connected (and the signing team is set up once
via Xcode):

```bash
flutter devices                  # confirm the iPhone shows up
flutter run --release            # release build, install + launch
```

The `--release` flag matters for testing real-world performance —
debug builds on iOS are noticeably slower (no JIT, so Flutter has to
emulate it).

---

## Troubleshooting

### "Code signing 'Runner' requires development team"

You skipped step 4.2. Open the workspace, set the Team.

### "Bundle Identifier … is not available"

Two people on the same Apple ID can't use the same bundle id. Change
it to something with your name or random suffix.

### "iPhone is busy: Preparing debugger support for iPhone"

Wait. First-device prep takes a while.

### "pod install" fails with "CDN: trunk URL couldn't be downloaded"

```bash
cd ios && pod repo update && pod install && cd ..
```

### Build hangs at "compiling Swift" for >15 min

Mac is probably low on RAM. Quit Xcode, quit Chrome/Slack, retry.

### App crashes on launch with no Xcode logs

Likely missing `assets/.env`. Verify it's at `apps/mobile/assets/.env`
and contains both Supabase variables.

### Map tab is blank

Google Maps iOS key not provisioned. See step 2.3, or ignore — the
rest of the app works.

### "Could not connect to lockdownd"

Unplug, replug, restart the iPhone, try again.

### "Untrusted Developer" doesn't appear in Settings → VPN & Device Management

Means the app didn't install. Check Xcode logs for the real error
(red lines in the **Issue Navigator** sidebar, ⌘5).

---

## What happens next (if you want more permanent distribution)

When you eventually want builds that work for the client without
plugging into your Mac every 7 days, you'll need:

- **Apple Developer Program** ($99/year)
- **Ad-hoc IPA + Diawi link** (1-year expiry, send a Safari install
  link)
- **Or TestFlight** (90-day expiry, refreshable with new uploads)

Both run on the same Mac with the same Flutter project — just
different distribution steps in Xcode. Ping me when you're at that
point and I'll write a second guide for it.
