# Milestone 5 — UAT Guide (Mobile, Online Build)

**Scope:** Schedule / Calendar, Appointments, Inspection, Documents & E-Signature on the Flutter mobile app.
**Time:** ~30 min for a full pass.
**Build:** Online only. Offline support is deferred to a follow-up milestone.

---

## Setup

- Android phone with the latest UAT build installed.
- Test homeowner phone (any device) — only needed to receive the signed-PDF link.
- Tenant should already have:
  - One **prospect** with a roof address and primary phone.
  - One **confirmed appointment** today, assigned to the rufero account below.
  - One **unsigned document** generated and **company-signed on the web** for that prospect.

## Accounts

| Role | Email |
|---|---|
| Rufero (field inspector) | `rufero@gmail.com` |
| Telefonista | `telefonista@gmail.com` |
| Owner / Admin | `ashenafigodanaj@gmail.com` |

Passwords are shared separately. Sign in as **Rufero** for everything below unless noted.

## Deferred / Accepted (please initial)

1. Offline mode is OFF — the app surfaces network errors normally; writes are not yet queued for later sync.
2. Ad-hoc / walk-in inspection (starting without a pre-booked appointment) is hidden in this build.
3. Push notifications for new / changed appointments are not part of M5.
4. iOS build is not provided in this UAT cycle.
5. Homeowner SMS reply on mobile is deferred.

---

## 1. Authentication

| # | What to verify | Pass | Fail | Notes |
|---|---|---|---|---|
| 1.1 | Sign in with the rufero account succeeds and lands on the main app shell. | ☐ | ☐ |   |
| 1.2 | Sign out from the avatar menu returns to the login screen. | ☐ | ☐ |   |
| 1.3 | Theme toggle switches the whole app between light and dark cleanly. | ☐ | ☐ |   |

---

## 2. Schedule — viewing the calendar

| # | What to verify | Pass | Fail | Notes |
|---|---|---|---|---|
| 2.1 | The Schedule tab shows the rufero's appointments and availability blocks. | ☐ | ☐ |   |
| 2.2 | Day, Week, and Month views all render correctly and show the same data. | ☐ | ☐ |   |
| 2.3 | A separate **List** view groups upcoming appointments by day. | ☐ | ☐ |   |
| 2.4 | Switching between Calendar and List does not lose or duplicate any events. | ☐ | ☐ |   |

---

## 3. Availability management

| # | What to verify | Pass | Fail | Notes |
|---|---|---|---|---|
| 3.1 | The rufero can create a one-off **busy** block (e.g. lunch). | ☐ | ☐ |   |
| 3.2 | The rufero can create a **recurring** working / busy block (e.g. every Monday). | ☐ | ☐ |   |
| 3.3 | Existing blocks can be edited and deleted, and changes reflect in all calendar views. | ☐ | ☐ |   |
| 3.4 | Default **working hours** per day can be saved and reload correctly. | ☐ | ☐ |   |

---

## 4. Appointment management

| # | What to verify | Pass | Fail | Notes |
|---|---|---|---|---|
| 4.1 | Tapping an appointment from **any surface** (Day, Week, List, or prospect detail) opens the same action sheet. | ☐ | ☐ |   |
| 4.2 | A confirmed appointment exposes three actions: **Start Inspection**, **Mark complete**, **No-show**. | ☐ | ☐ |   |
| 4.3 | **Mark complete** requires explicit confirmation and updates the status without a manual refresh. | ☐ | ☐ |   |
| 4.4 | **No-show** requires a written reason and stores it on the appointment. | ☐ | ☐ |   |
| 4.5 | Terminal appointments (completed / canceled / no-show) show "no further actions" instead of buttons. | ☐ | ☐ |   |

---

## 5. Inspection capture

| # | What to verify | Pass | Fail | Notes |
|---|---|---|---|---|
| 5.1 | Photos can be added from **camera** and from **gallery**, and appear in the inspection grid. | ☐ | ☐ |   |
| 5.2 | Each photo can be **tagged** (Overview, Close-up damage, etc.) and the tag can be changed later. | ☐ | ☐ |   |
| 5.3 | Photos can be opened full-screen and deleted. | ☐ | ☐ |   |
| 5.4 | The damage form captures roof age, material, storm date, affected areas, severity, and notes. | ☐ | ☐ |   |
| 5.5 | The form **autosaves**: backing out and reopening the inspection preserves all entered values. | ☐ | ☐ |   |
| 5.6 | Attempting **Save & Continue** with missing required fields surfaces clear errors and blocks the save. | ☐ | ☐ |   |
| 5.7 | A complete inspection (required fields + ≥3 photos with Overview + Close-up damage tags) saves and proceeds to the document preview. | ☐ | ☐ |   |

---

## 6. E-signature

| # | What to verify | Pass | Fail | Notes |
|---|---|---|---|---|
| 6.1 | The document preview displays the correct status: **Ready to sign**, **Company signed · homeowner pending**, **Already signed**, or **Not generated**. | ☐ | ☐ |   |
| 6.2 | The unsigned PDF can be opened and reviewed before signing. | ☐ | ☐ |   |
| 6.3 | The signature pad accepts the homeowner's name and a drawn signature. | ☐ | ☐ |   |
| 6.4 | After signing, the user sees a success confirmation and the document state flips to **Already signed**. | ☐ | ☐ |   |
| 6.5 | The fully signed PDF can be opened and shows both the company and homeowner signatures embedded. | ☐ | ☐ |   |

---

## 7. Document management

| # | What to verify | Pass | Fail | Notes |
|---|---|---|---|---|
| 7.1 | The bottom-nav **Documents** tab shows two sections: **Needs signature** and **All documents**. | ☐ | ☐ |   |
| 7.2 | Each document card shows the prospect name, document type, creation date, and a status indicator. | ☐ | ☐ |   |
| 7.3 | Tapping a card opens that exact document (not the latest one for the prospect). | ☐ | ☐ |   |
| 7.4 | The list refreshes automatically when the tab is re-opened after a sign action elsewhere. | ☐ | ☐ |   |
| 7.5 | A per-prospect Documents tab on the prospect detail page shows the same documents and actions. | ☐ | ☐ |   |

---

## 8. Prospect detail

| # | What to verify | Pass | Fail | Notes |
|---|---|---|---|---|
| 8.1 | Prospects can be browsed in both **list** and **map** views. | ☐ | ☐ |   |
| 8.2 | The detail page exposes tabs for Profile, Appointments, Documents, Inspections, and Notes. | ☐ | ☐ |   |
| 8.3 | The Appointments tab lists upcoming and past appointments for that prospect, with the same actions as the schedule. | ☐ | ☐ |   |
| 8.4 | The Inspections tab lists past and in-progress inspections for that prospect, newest first. | ☐ | ☐ |   |

---

## 9. End-to-end workflow

A single continuous run, with signal, validating the headline flow.

1. Sign in as the rufero.
2. Open today's first appointment from the schedule.
3. Start the inspection, take ≥4 photos with Overview + Close-up damage tags.
4. Fill the damage form completely.
5. Save & Continue → on the preview page, sign as the homeowner.
6. Confirm the success message and the document flipping to **Already signed**.
7. Open the signed PDF and confirm both signatures are present.
8. Return to the appointment and **Mark complete**.
9. Verify in the Documents inbox that the doc has moved to **All documents · Signed**.
10. Verify in the Schedule that the appointment is now **Completed**.

☐ Pass ☐ Fail — Issues: ____

---

## Sign-off

| Tester | Date | Build version | Pass / Fail | Notes |
|---|---|---|---|---|
|   |   |   |   |   |
