

# Milestone 3 — UAT Test Guide

**Audience:** Client / Product Owner
**Reference:** `docs/requirements/roofaid-project-blueprint.md` § "M3 — Dashboard Polish + Maps (Week 4)" (tasks M3-1 through M3-8).
**Purpose:** Sign-off on what was built against the M3 blueprint. Stories are organized by M3 task ID.
**Estimated time:** ~25 minutes.

---

## How to use

For each story, log in with the role specified, follow the steps, compare to the expected result, and tick **Pass** or **Fail**. If something does not match, write a short note on the **Issues** line.

> **Out of scope for this sign-off:**
> - **M3-7 / M3-8 (Mobile map + mobile profile tabs)** — Flutter app is deferred.
> - **M3-3 (Calls / SMS / Email / Documents / Inspection profile tabs)** — depend on M4 (Telnyx + SendGrid) and M5 (PDF + e-sign).
> - **M3-4 (Prospect create/edit form + geocoding)** — covered in a separate sign-off; not part of this UAT pass.
> - **M3-5 (Prospect assignment)** — covered in M2 sign-off; unchanged in M3.
> - Real Call / SMS / Email actions — buttons render but do not place real calls (M4).

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

## Sign-off

| Section | Result |
|---------|--------|
| M3-1 Google Maps | ____ Pass / ____ Fail |
| M3-2 Proximity search | ____ Pass / ____ Fail |
| M3-6 DNC management (with deviation) | ____ Pass / ____ Fail |

**Acknowledged backlog items (not blockers for this sign-off):**
- M3-2: Proximity search runs client-side over loaded rows; PostGIS server-side upgrade pending.
- M3-6: DNC enforcement (disable Call/SMS) — moved to M4 where the dialer/SMS actually exist.

**Tester name:** ________________________   **Date:** ________________________

**Client sign-off (initials):** ___________   **Date:** ___________