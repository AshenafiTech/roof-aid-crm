# Milestone 3 — UAT Test Guide

**Audience:** Client / Product Owner
**Reference:** `docs/requirements/roofaid-project-blueprint.md` § "M3 — Dashboard Polish + Maps (Week 4)" (tasks M3-1 through M3-8).
**Purpose:** Sign-off on what was built against the M3 blueprint. Stories are organized by M3 task ID.
**Estimated time:** ~40 minutes (web ~25 min, mobile ~15 min).

---

## How to use

For each story, log in with the role specified, follow the steps, compare to the expected result, and tick **Pass** or **Fail**. If something does not match, write a short note on the **Issues** line.

> **Out of scope for this sign-off:**
> - **M3-3 (Calls / SMS / Email / Documents / Inspection profile tabs)** — depend on M4 (Telnyx + SendGrid) and M5 (PDF + e-sign).
> - **M3-4 (Prospect create/edit form + geocoding)** — covered in a separate sign-off; not part of this UAT pass.
> - **M3-5 (Prospect assignment)** — covered in M2 sign-off; unchanged in M3.
> - Real Call / SMS / Email actions on web — buttons render but do not place real calls (M4).
> - **iOS mobile build** — Android-only for this milestone (no Mac/iOS device on the build machine).

---

## Test accounts

| Role | Email | Password |
|------|-------|---------|
| Owner | `ashenafigodanaj@gmail.com` | `Demo1234!` |
| Telefonista | `telefonista@gmail.com` | (provided separately) |
| Rufero | `rufero@gmail.com` | (provided separately) |

---

## M3-1 — Google Maps on dashboard

> **Blueprint:** "Right panel map showing all prospect results as color-coded pins by status. Map auto-zooms to fit results. Click pin → highlight corresponding card and scroll to it in list."

### Story M3-1.1 — Color-coded pins for every loaded prospect

**As a** Telefonista,
**I want** the prospects/new-leads list to show a real Google Map with one pin per loaded prospect, color-coded by status.

**Steps:**
1. On desktop, open `/prospects`. Confirm the map is the default view (List/Map toggle on the right).
2. Toggle Map ↔ Satellite using the built-in control.
3. Click **Load 60 More** at the bottom of the list.
4. Apply a city filter and click **Query Database**.
5. Resize the browser to mobile width.

**Expected:**
- Map renders with one pin per loaded prospect, color-coded by status (blue / indigo / sky / amber / purple / emerald / gray).
- Map / Satellite toggle works.
- Loading more rows adds more pins without yanking the camera.
- Filters update both list and pins together.
- On mobile width (`<sm`), the toggle is hidden and only the list is shown.
- If the Google Maps API key is missing, a friendly placeholder renders instead of a crash.

- [ ] **Pass / Fail**
- Issues:

---

### Story M3-1.2 — Click pin highlights the corresponding card

**As a** Telefonista,
**I want** clicking a pin to open the prospect's info window and select the matching row in the list panel.

**Steps:**
1. Hover any pin (no click).
2. Click a pin.
3. Click a different pin, then click empty map.

**Expected:**
- Hover does **not** open any label.
- Click opens an InfoWindow with the prospect's name, address, and status (dark text on white background).
- The matching prospect card is **selected** in the side panel.
- Clicking another pin closes the previous InfoWindow and selects the new card.

- [ ] **Pass / Fail**
- Issues:

---

## M3-2 — Proximity search

> **Blueprint:** "Right-click on map → Proximity Search modal: center point (auto-set from click), radius selector, status filter, Search button."
>
> **Implementation note:** Proximity is a **client-side filter over the loaded rows** (haversine distance). It does **not** widen the database query — to cover the entire dataset, click **Load N More** first, then run the proximity search. A server-side PostGIS upgrade is tracked as a follow-up.

### Story M3-2.1 — Right-click → radius picker → filter list & pins

**As a** Telefonista,
**I want** to right-click anywhere on the map, pick a radius, and have both the list and pins filter to that circle.

**Steps:**
1. On `/prospects` (Map view), pan the map far away from any visible pins.
2. **Right-click** anywhere → popup opens with a slider.
3. Drag the slider (0.5 – 50 km) and watch the live preview circle.
4. Click **Search**.
5. Click **Clear radius** in the list panel (or Clear in the popup).

**Expected:**
- Live preview circle updates while dragging.
- After **Search**: a thicker shaded blue circle is drawn, the camera **auto-fits** to the circle, and the list panel shows `N within X.X km of pinned point`.
- Pins outside the circle are hidden from both the map and the list.
- **Clear radius** restores the full loaded set.
- The popup heading reads `Search prospects` on `/prospects` and `Search leads` on `/new-leads`.

- [ ] **Pass / Fail**
- Issues:

---

### Story M3-2.2 — Coordinate-based search input

**As a** Telefonista,
**I want** to type a known latitude / longitude / radius into the filter bar (without right-clicking the map).

**Steps:**
1. On `/prospects`, click the **Coords** button to expand the coordinate inputs.
2. Type a latitude, longitude, and radius (e.g. `36.2`, `-94.2`, `25`).
3. Click **Query Database**.
4. Click **Clear** in the coordinates row.

**Expected:**
- The list narrows to prospects within the radius.
- Combining the coordinate filter with the map's right-click circle further narrows the result.
- **Clear** drops only the coordinate filter and collapses the row.

- [ ] **Pass / Fail**
- Issues:

---

## M3-6 — DNC flag management (with deliberate deviation)

> **Blueprint:** "DNC toggle accessible only from full profile. Reason required. Timestamp recorded. DNC disables Call and SMS buttons everywhere. DNC records never deleted."
>
> **Delivered in M3 with two deliberate deviations from the blueprint — please confirm these are acceptable:**
> 1. **DNC toggle is also available as a one-click button on the row action bar and side-panel action bar** (in addition to the full profile). This was added at the request of telefonistas to flag bad numbers without opening the profile.
> 2. **DNC is informational only — it does NOT disable Call / SMS buttons anywhere.** A red badge + "DNC Flagged — call/message with caution" tooltip warns the user, but it is up to the user to decide whether to call. This applies to every Call/SMS surface: the prospect row actions, the side panel, the detail page action bar, and any other place those buttons appear.
>
> Reason and timestamp are still recorded; DNC records are still never deleted.

### Story M3-6.1 — DNC toggle + reason from prospect profile

**As a** compliance-conscious Telefonista,
**I want** to flag a prospect as Do-Not-Call from the profile with a reason.

**Steps:**
1. Open a prospect detail page.
2. On the Overview tab, toggle DNC on. Provide a reason (e.g. "Requested removal").
3. Refresh the page.
4. Open the **Activity** tab.

**Expected:**
- DNC badge appears on the profile header and on the list row.
- Activity tab logs a `dnc` event with the reason and a timestamp.
- DNC persists after refresh.

- [ ] **Pass / Fail**
- Issues:

---

### Story M3-6.2 — DNC quick-flag + Call / SMS stay enabled everywhere (deviation)

**As a** Telefonista,
**I want** a one-click DNC toggle on the prospect row and side-panel action bar — and I want Call / SMS to stay clickable on a DNC prospect (with a warning) so I can override on a case-by-case basis.

**Steps:**
1. Open `/prospects` in Map view (so the side panel shows).
2. On any prospect row, click the **PhoneOff** quick-flag icon.
3. Confirm the row's **Call** and **SMS** icons are still clickable (not greyed out).
4. Hover the **Call** icon — confirm the tooltip reads "DNC Flagged — call with caution".
5. Hover the **SMS** icon — confirm the tooltip reads "DNC Flagged — message with caution".
6. Open the side panel and confirm the same: DNC button toggles instantly, and the side panel's **Call** / **SMS** buttons remain enabled with the same warning tooltips.
7. Open the prospect's full profile and confirm Call / SMS there are also enabled with the warning.

**Expected:**
- Each DNC toggle is instant (red filled = active, outline = inactive).
- Activity logs a `dnc` event.
- Call / SMS buttons remain clickable on **every surface** (row actions, side panel, profile) — no `disabled` state ever.
- Tooltips clearly warn when DNC is set, leaving the decision to the user.

- [ ] **Pass / Fail** — *Confirms acceptance of deviation from blueprint*
- Issues:

---

## Test devices (mobile)

| Platform | Build | Notes |
|---|---|---|
| Android (phone, OS 10+) | `roof-aid-vX.Y.Z.apk` (provided alongside this doc) | Sideload via "Install from unknown sources" or internal Play track |
| iOS | — | Deferred (no Mac/iOS device on the build machine; ships in a later milestone) |

For the mobile pass, sign in with the **Rufero** test account from the table above. Telefonistas use the web; the mobile app is field-optimised for Ruferos.

---

## M3-7 — Mobile map view (Rufero)

> **Blueprint:** "Mobile map screen showing assigned prospects as color-coded pins. Tap pin → open detail. Tapping the prospect from the list also opens detail."
>
> **Implementation note:** Mobile only loads the prospects **assigned to the signed-in Rufero**, not the global database. List/Map are two views over the same fetch — toggling does not re-query.

### Story M3-7.1 — Sign in and see assigned prospects (list & map)

**As a** Rufero in the field,
**I want** to sign in on my phone and see only the houses assigned to me, in either a list or a map view.

**Steps:**
1. Launch the Roof-Aid app on Android. Sign in with the Rufero credentials.
2. The app lands on the **Prospects** tab (bottom navigation).
3. The **List/Map** segmented toggle is at the top of the tab.
4. Pull down on the list to refresh.
5. Tap **Map**.

**Expected:**
- Bottom navigation shows 5 tabs (Schedule, Prospects, Documents, Messages, Settings) — only the **selected** tab's label is visible (icon-only on the rest).
- The List view shows one card per assigned prospect with name, address, primary phone, and a colored status badge.
- Pull-to-refresh shows a spinner and re-fetches without losing the user's place.
- Map view shows one color-coded pin per geolocated prospect. Camera auto-fits the bounds of all pins.
- A floating "**N prospects**" or "**N of M mapped**" chip appears top-right of the map (the latter when some prospects have no coordinates yet).

- [ ] **Pass / Fail**
- Issues:

---

### Story M3-7.2 — Tap a pin to open the prospect

**As a** Rufero,
**I want** tapping a pin to surface the homeowner's name and open the full detail in two taps.

**Steps:**
1. On the Map view, tap any pin.
2. Tap the **InfoWindow** (the bubble that pops up over the pin).
3. Tap the system back arrow to return to the map.

**Expected:**
- Tapping a pin opens an InfoWindow with the prospect's **name** and **address**.
- Tapping the InfoWindow opens the **Prospect Detail** page.
- Back returns to the map with the same camera position; no flicker, no re-fetch.

- [ ] **Pass / Fail**
- Issues:

---

### Story M3-7.3 — Empty / error states

**As a** Rufero,
**I want** clear feedback when there are no pins to show or when something fails to load — not a blank screen.

**Steps:**
1. Sign in as a Rufero who has **no assigned prospects with coordinates** (or temporarily strip lat/lng from the assigned rows in DB).
2. Toggle to **Map**.
3. With airplane mode on, force-close and reopen the app.

**Expected:**
- Map view shows a friendly empty card: *"No locations to display — your assigned prospects don't have coordinates yet."*
- With no network, the list shows a clear error card with a **Retry** button (not a stack trace, not a blank screen).

- [ ] **Pass / Fail**
- Issues:

---

## M3-8 — Mobile prospect detail (Rufero)

> **Blueprint:** "7-tab detail page: Overview, Calls, SMS, Appointments, Documents, Inspection, Notes. Quick actions for Call / SMS / Navigate."
>
> **Delivered in M3 with these deliberate scope choices — please confirm acceptable:**
> 1. **Call / SMS / Navigate hand off to the device's native apps** (phone dialer, Messages, Google Maps / Apple Maps). In-app Telnyx calling and SendGrid SMS land in M4 — keeping field Ruferos on hardware they already trust (speakerphone, bluetooth, etc.).
> 2. **DNC is informational only on mobile too** — it shows a red banner at the top of the detail page but does **not** disable Call / SMS. Matches the web deviation in M3-6.
> 3. **Five of the seven tabs are placeholders** (Calls, SMS, Appointments, Documents, Inspection) — they ship in M4 / M5 alongside the underlying providers.

### Story M3-8.1 — Open detail from list and from map

**As a** Rufero,
**I want** tapping a prospect from either the list or a map pin to land on the same detail page.

**Steps:**
1. From the **List** view, tap any prospect card.
2. Note the tabs at the top: **Overview, Calls, SMS, Appointments, Documents, Inspection, Notes**.
3. Tap each tab in turn.
4. Press back, switch to **Map**, tap a pin → InfoWindow → tap to open.

**Expected:**
- Both entry paths land on the same detail page.
- The app bar shows the prospect's name (truncated with `…` on long names).
- Overview and Notes tabs render real content; the other five show clear "Coming soon" placeholders.
- Switching tabs is smooth — no loading spinner on tab change.

- [ ] **Pass / Fail**
- Issues:

---

### Story M3-8.2 — Overview tab data

**As a** Rufero standing on the homeowner's porch,
**I want** the Overview tab to show every field I might need at a glance, fitting on one screen with little to no scroll.

**Steps:**
1. Open Overview on a prospect that has all fields filled in (address, phone, email, hail size, home value, coordinates).
2. Compare each field to the web profile for the same prospect.
3. Open Overview on a prospect with **only an address** (no hail / value / coords).
4. Toggle the system **Light / Dark** theme using the sun/moon icon in the app bar.

**Expected:**
- **Status** card shows a colored dot + status label.
- **Contact** card shows Name, Phone(s), Email when present.
- **Property** card shows Address full-width on top, then a compact 2-column grid of Hail size / Home value / Coordinates (only fields that are populated appear).
- **Record** card shows Created and Last updated timestamps.
- Missing fields are gracefully omitted (no blank rows).
- Both light and dark themes render cleanly — no white-on-white text, no broken contrast.

- [ ] **Pass / Fail**
- Issues:

---

### Story M3-8.3 — DNC banner

**As a** Rufero,
**I want** to see at a glance if the homeowner is flagged Do-Not-Call before I knock — but I want the final call to be mine.

**Steps:**
1. Use the web app to flag a prospect as DNC with a reason.
2. On the mobile app, refresh the list and open that prospect's detail.
3. Confirm the **Call** and **SMS** buttons in the bottom action bar are still tappable.

**Expected:**
- A red **DNC banner** with the reason appears between the tab bar and the tab content.
- The Call / SMS buttons in the bottom action bar are **not** disabled — they remain tappable. *(Confirms acceptance of the same deviation already accepted on web for M3-6.)*

- [ ] **Pass / Fail** — *Confirms acceptance of mobile DNC deviation*
- Issues:

---

### Story M3-8.4 — Quick actions: Call, SMS, Navigate

**As a** Rufero,
**I want** one-tap Call, SMS, and Navigate that hand off to the apps already on my phone.

**Steps:**
1. On a prospect with a phone number and coordinates, tap **Call** → confirm the device dialer opens with the number pre-filled. Press back.
2. Tap **SMS** → confirm the device messaging app opens addressed to the same number. Press back.
3. Tap **Navigate** → confirm Google Maps (or Apple Maps on iOS) opens with directions to the prospect's coordinates.
4. Open a prospect that has **no phone number** — confirm Call and SMS are visibly disabled (greyed).
5. Open a prospect with **no coordinates** — confirm Navigate is visibly disabled.

**Expected:**
- Each button hands off cleanly to the native app — no in-app dialer, no errors.
- Disabled buttons are clearly greyed and don't respond to taps.
- If the device has no dialer / SMS / maps app installed, a snackbar appears: *"No dialer app available"* etc., instead of a crash.

- [ ] **Pass / Fail**
- Issues:

---

### Story M3-8.5 — Notes feed: add, edit, delete

**As a** Rufero,
**I want** to leave a note about a visit and edit / fix it within a short window if I made a typo — but I shouldn't be able to rewrite history hours later.

**Steps:**
1. Open the **Notes** tab on a prospect.
2. In the composer at the bottom, type a note ("Knocked at 2pm — no answer") and tap the send button.
3. Confirm the note appears at the **top** of the feed with your name + "just now".
4. Tap the **⋯** (more) menu on your own note → **Edit** → change the text → Save.
5. Tap **⋯** → **Delete** → confirm dialog → Delete.
6. Open a prospect with notes from another user — confirm the **⋯** menu does **not** appear on their notes.
7. (Optional) Add a note, wait 16 minutes, refresh — confirm the **⋯** menu is gone.
8. Refresh the web profile — confirm the note(s) added on mobile appear there too.

**Expected:**
- Composer clears after a successful submit; the new note appears at the top.
- Edit and Delete only appear on **your own** notes and only within **15 minutes** of creation.
- Delete shows a confirmation dialog ("Delete note? — cannot be undone").
- Notes added on mobile appear on web in real-time (and vice-versa).
- Network errors during submit show an inline red banner above the composer with a clear reason.

- [ ] **Pass / Fail**
- Issues:

---

### Story M3-8.6 — Return highlight (UX polish)

**As a** Rufero,
**I want** to remember which prospect I just looked at when I bounce back to the list.

**Steps:**
1. Scroll the list and tap a prospect roughly in the middle.
2. Press back.
3. Repeat — tap a prospect near the **bottom** of the list, press back.

**Expected:**
- On return, the row that was just visited briefly **pulses with a primary-colored tint** (~1 s), then fades back to normal.
- If that row was scrolled out of view, the list **smoothly auto-scrolls** to bring it into the upper third of the screen before the pulse plays.
- Tapping any other row immediately cancels the pulse — no flicker.

- [ ] **Pass / Fail**
- Issues:

---

## Sign-off

| Section | Result |
|---------|--------|
| M3-1 Google Maps | ____ Pass / ____ Fail |
| M3-2 Proximity search | ____ Pass / ____ Fail |
| M3-6 DNC management (with deviation) | ____ Pass / ____ Fail |
| M3-7 Mobile map (Android) | ____ Pass / ____ Fail |
| M3-8 Mobile prospect detail (Android) | ____ Pass / ____ Fail |

**Acknowledged backlog items (not blockers for this sign-off):**
- M3-2: Proximity search runs client-side over loaded rows; PostGIS server-side upgrade pending.
- M3-6: DNC enforcement (disable Call/SMS) — moved to M4 where the dialer/SMS actually exist.
- M3-7 / M3-8: iOS build deferred — no Mac/iOS device on the build machine. Android-only for this milestone.
- M3-8: Five of seven detail tabs (Calls / SMS / Appointments / Documents / Inspection) are placeholders pending M4 (Telnyx + SendGrid) and M5 (PDF + e-sign).

**Tester name:** ________________________   **Date:** ________________________

**Client sign-off (initials):** ___________   **Date:** ___________
