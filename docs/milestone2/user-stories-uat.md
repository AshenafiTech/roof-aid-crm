# Milestone 2 — User Stories & UAT Test Guide

**Audience:** Client / Product Owner
**Purpose:** Walk through every feature delivered in Milestone 2. Follow each story step-by-step and mark it **Pass** or **Fail** in the checkbox. This is the official sign-off document for M2.
**Estimated time to complete:** ~45 minutes end-to-end.

---

## 1. How to use this document

1. Read Section 2 (Test accounts) and log in with the user specified at the start of each story.
2. For each story, follow the **Steps to test** in order.
3. Compare the outcome to **Expected result**.
4. Tick the **Pass/Fail** checkbox at the end of the story.
5. If something does not match, write a short note in the **Issues** line so the team can reproduce it.

> **Important note on scope (please read before testing):**
> - The **map/satellite view** is temporarily hidden. Only the list view is available. Map view will be restored in M3. Any story in this document refers to the **list view only**.
> - The **Flutter mobile app** is not part of this sign-off. Mobile stories (Section 9) were scoped out of M2 and will be tested with M3.
> - Call, SMS, Email action buttons are visible but do not place real calls or send real messages yet. Real integration arrives in M4.

---

## 2. Test accounts

Use the seeded demo tenant. All accounts share the same tenant so you can switch between them to verify role-based behavior.

| Role | Email | password |
|------|-------|---------|
| Owner | `ashenafigodanaj@gmail.com` | `Demo1234!` |
| Telefonista | `telefonista@gmail.com` | `ced84c74-aaa4-41Aa1!` |
| Rufero | `rufero@gmail.com` | `80fe63ab-f627-48Aa1!` |

> Passwords will be provided separately. If a seeded account is missing, ping the dev team before starting UAT.

---

## 3. Authentication & Navigation

### Story 3.1 — Log in as each role and see the correct sidebar

**As a** user of any role,
**I want** the sidebar to only show the pages my role is allowed to open,
**so that** I am not distracted by features I cannot use.

**Prerequisites:** Logged out.

**Steps to test:**
1. Log in as **Owner**. Note the sidebar entries.
2. Log out, log in as **Admin**. Compare sidebar.
3. Log out, log in as **Telefonista**. Compare sidebar.
4. Log out, log in as **Rufero**. Compare sidebar.

**Expected result:**
- **Owner / Admin** see: Dashboard, All Leads, New Leads, Prospects, Contacted, Scheduled, Closed Customers, Not Viable, Appointments, Documents, plus **Admin section** (Users, Analytics, Settings).
- **Telefonista** sees the same main pages as Admin **without** the Admin section.
- **Rufero** sees only a minimal set (Dashboard and their assigned leads). No Admin section.
- Navigating to an admin page as Telefonista or Rufero is blocked.

- [ ] **Pass / Fail**
- Issues:

---

### Story 3.2 — Dark mode toggle

**As a** user who works long hours on the CRM,
**I want** a dark mode toggle,
**so that** the UI is comfortable to read in low-light environments.

**Steps to test:**
1. Locate the theme toggle in the top bar or profile menu.
2. Switch between Light and Dark.
3. Refresh the page.

**Expected result:**
- Whole UI — sidebar, tables, cards, dialogs — flips to the selected theme.
- Choice is remembered after refresh.

- [ ] **Pass / Fail**
- Issues:

---

## 4. Dashboard (Command Center)

### Story 4.1 — Dashboard shows real metrics (Owner / Admin / Telefonista)

**As a** Telefonista starting my shift,
**I want** a dashboard with real-time pipeline numbers,
**so that** I know where to focus today.

**Steps to test:**
1. Log in as **Telefonista**.
2. Land on `/` (Dashboard).
3. Inspect each card and section.

**Expected result:**
- Four metric cards at the top show **live** counts: Total Prospects, Today's Appointments, Unread Notifications, Conversion Rate.
- Pipeline breakdown bar chart shows a colored segment per status with counts that match what you see on the individual status tabs.
- **Upcoming Appointments** card lists the next 5 appointments (prospect name is a link).
- **Recent Activity** card lists the last ~10 team actions with relative timestamps ("5 min ago").
- Numbers are non-zero (seed data is present).

- [ ] **Pass / Fail**
- Issues:

---

### Story 4.2 — Dashboard scoped for Rufero

**As a** Rufero,
**I want** the dashboard to only reflect prospects assigned to me,
**so that** I am not confused by team-wide numbers.

**Steps to test:**
1. Log out and log in as **Rufero**.
2. Compare the metric counts with what you saw as Telefonista.

**Expected result:**
- Metric counts are lower — they reflect only prospects assigned to this rufero.
- Recent activity only shows actions relevant to their assigned prospects.

- [ ] **Pass / Fail**
- Issues:

---

## 5. Lead Pipeline — List & Filtering

### Story 5.1 — Pipeline status tabs in the sidebar

**As a** Telefonista,
**I want** a dedicated tab per pipeline status,
**so that** I can jump straight to the stage I need to work.

**Steps to test:**
1. As Telefonista, click each sidebar entry in order: **All Leads → New Leads → Prospects → Contacted → Scheduled → Closed Customers → Not Viable**.
2. For each, confirm the list only contains records with that status.

**Expected result:**
- Each tab renders a list filtered to its status.
- The counter at the top reads `X of Y <status>` (e.g. `60 of 152 new leads`).
- **All Leads** shows every status but exposes a **Status dropdown** that filters the list without reloading the page.

- [ ] **Pass / Fail**
- Issues:

---

### Story 5.2 — City, state, status, and search filters

**As a** Telefonista,
**I want** to narrow prospects by city, state, status, and free-text search,
**so that** I can target a specific geography or name.

**Steps to test:**
1. Open **All Leads**.
2. Open the **City** dropdown, pick any city.
3. Open the **State** dropdown, pick the matching state.
4. Pick a **Status** from the dropdown.
5. Type a partial name, phone, or address in the **Search** box and press Enter / click Query.
6. Click **Clear** to reset.

**Expected result:**
- The list updates after each filter change.
- The URL updates to reflect the filters (you can copy/paste the URL and the filters persist).
- Counter updates to the new filtered total.
- Clear resets all filters and the URL.

- [ ] **Pass / Fail**
- Issues:

---

### Story 5.3 — "Load 60 More" pagination

**As a** Telefonista,
**I want** to keep scrolling through more prospects without losing the ones I already saw,
**so that** I can review and revisit leads in the same session.

**Steps to test:**
1. Open **New Leads** on a tenant that has more than 60 records.
2. Scroll to the bottom of the list.
3. Click **Load 60 More**.
4. Scroll back up and confirm the first 60 rows are still present.

**Expected result:**
- Counter changes from `60 of Y` to `120 of Y`.
- The first 60 rows remain; 60 new rows are appended below.
- Button hides when all rows are loaded.

- [ ] **Pass / Fail**
- Issues:

---

### Story 5.4 — Anti-collision rotation (business-critical)

**As an** office manager,
**I want** two Telefonistas logging in at different times to see a different starting prospect,
**so that** they do not call the same homeowner simultaneously.

**Steps to test:**
1. Log in as **Telefonista** in Browser A. Open **New Leads**. Note the first prospect's name.
2. Wait 10 seconds.
3. In Browser B (Incognito), log in as **Admin**. Open **New Leads**. Note the first prospect's name.
4. Repeat step 3 after another 10–20 seconds.

**Expected result:**
- The first prospect is **different** across the two loads done seconds apart.
- The set of 60 prospects is the same; only the order is rotated.

- [ ] **Pass / Fail**
- Issues:

---

### Story 5.5 — Inline row actions on `/prospects`

**As a** Telefonista,
**I want** action buttons directly on a prospect row,
**so that** I can call / SMS / email / schedule / navigate / note without opening the detail page.

**Steps to test:**
1. Open **Prospects** (status = prospects).
2. Look at any row — confirm the action buttons: Call, SMS, Email, Appointment, Navigate, Note.
3. Hover / click each.
4. Locate a DNC-flagged prospect.

**Expected result:**
- All 6 action buttons render on each row.
- On a DNC-flagged prospect, **Call** and **SMS** are visibly disabled.
- Actions are row-only on `/prospects`; other tabs (All Leads, New Leads, Contacted, Scheduled, Closed, Not Viable) fall back to row-click → detail.

- [ ] **Pass / Fail**
- Issues:

---

### Story 5.6 — Bulk actions

**As an** Admin,
**I want** to multi-select prospects and bulk-assign them to a Rufero,
**so that** I can distribute work efficiently.

**Steps to test:**
1. Open **New Leads** as Admin.
2. Tick the checkbox on 3–5 rows.
3. Open **Bulk Actions → Assign Rufero** and pick a rufero.
4. Click **Deselect all**.

**Expected result:**
- Selection toolbar shows "N selected" and a Bulk Actions button.
- After the bulk assignment, every selected prospect's Assigned column updates to the chosen rufero.
- Deselect all clears the selection chip.

- [ ] **Pass / Fail**
- Issues:

---

## 6. Prospect Detail

### Story 6.1 — Detail page with tabs

**As a** Telefonista,
**I want** to open a prospect and see all their information in tabs,
**so that** I can review the full context before calling.

**Steps to test:**
1. From any list, click a prospect row.
2. Cycle through the tabs: **Overview, Pipeline, Assignment, Activity, Notes**.

**Expected result:**
- Each tab renders without errors.
- Overview shows name, address, city, state, phone, email, tipo, home value, hail size, source, DNC indicator.
- Pipeline shows the current status with options to transition (subject to role).
- Assignment shows current assignee and allows reassignment (role-gated).
- Activity shows a chronological log of status changes, notes, assignments, updates, DNC changes.
- Notes tab allows adding a new note; note appears in Activity.

> Remaining tabs (Calls, SMS, Email, Appointments, Documents, Inspection, Map) are scoped to M3–M6 and are intentionally not on the detail page yet.

- [ ] **Pass / Fail**
- Issues:

---

### Story 6.2 — Change status and see it logged

**As a** Telefonista,
**I want** changing a prospect's status to be logged,
**so that** there is an audit trail of who moved what and when.

**Steps to test:**
1. Open a prospect with status `new_leads`.
2. Change status to `prospects`, then to `contacted`.
3. Open the **Activity** tab.

**Expected result:**
- Each status change adds a new activity entry with user, timestamp, and old→new status.
- The prospect now appears in the **Contacted** tab and no longer in **New Leads**.

- [ ] **Pass / Fail**
- Issues:

---

### Story 6.3 — DNC toggle with reason

**As a** compliance-conscious Telefonista,
**I want** to mark a prospect Do-Not-Call with a reason,
**so that** nobody on the team calls them again.

**Steps to test:**
1. Open a prospect detail page.
2. Scroll to the **DNC toggle** on the Overview tab.
3. Enter a reason (e.g. "Requested removal on phone call").
4. Toggle DNC on.
5. Return to the list.
6. Re-open the prospect.

**Expected result:**
- DNC badge appears on the detail header and on the list row.
- Call and SMS buttons are disabled everywhere this prospect appears.
- Activity tab logs a `dnc` event with the reason and a timestamp.
- The DNC record survives refresh/reload (persisted to DB).

- [ ] **Pass / Fail**
- Issues:

---

## 7. Appointments & Analytics

### Story 7.1 — Appointments page

**As a** Telefonista or Admin,
**I want** a list of appointments I can filter,
**so that** I can plan the day and the week.

**Steps to test:**
1. Open **Appointments** from the sidebar.
2. Review the **Stats cards**: Today, Upcoming, Pending, Completed.
3. Apply the **Time range** filter: Upcoming / Today / Past / All.
4. Apply the **Status** filter.
5. Click a prospect name on any appointment card.

**Expected result:**
- Stats cards show real counts.
- Filters narrow the list without full page reload.
- Clicking a prospect link navigates to that prospect's detail page.
- Ruferos opening this page only see appointments for prospects assigned to them.

- [ ] **Pass / Fail**
- Issues:

---

### Story 7.2 — Analytics (Owner / Admin only)

**As an** Owner,
**I want** an analytics page with team performance and conversion funnel,
**so that** I can coach the team.

**Steps to test:**
1. Log in as **Owner**. Open **Admin → Analytics**.
2. Review the metric cards, pipeline breakdown, conversion funnel, team performance table, recent activity.
3. Log out, log in as **Telefonista**, try to open `/admin/analytics` by URL.

**Expected result:**
- Owner sees the full analytics page with real numbers (not "Coming soon").
- Conversion funnel shows Contact / Schedule / Close percentages.
- Team performance table lists each user with assigned, closed, and activity counts over the last 30 days.
- Telefonista is blocked from the analytics route.

- [ ] **Pass / Fail**
- Issues:

---

## 8. Real-time, Multi-Tenant & Admin

### Story 8.1 — Real-time updates

**As a** Telefonista,
**I want** the dashboard and list to update when teammates change a prospect,
**so that** I never work from stale data.

**Steps to test:**
1. Log in as **Telefonista** in Browser A on the Dashboard.
2. In Browser B (Admin), open a prospect and change its status.
3. Watch Browser A without refreshing.

**Expected result:**
- Within a couple of seconds, Browser A's dashboard/list reflects the new status (counter, row, or activity item updates).
- No manual refresh needed.

- [ ] **Pass / Fail**
- Issues:

---

### Story 8.2 — Role-based access to user management

**As an** Owner,
**I want** to invite, edit, deactivate, and reset passwords for my team,
**so that** I can manage the tenant without calling support.

**Steps to test (as Owner):**
1. Open **Admin → Users**.
2. Click **Invite**. Fill first name, last name, email, pick the **Telefonista** role, add a phone number. Create.
3. Copy the temporary credentials shown in the dialog.
4. On an existing user row, open the actions dropdown → **Edit**, update the phone number, save.
5. On the same user, open the dropdown → **Deactivate**. Confirm the badge change.
6. Reactivate the same user.
7. Click **Reset Password**. Confirm the new temp password dialog.

**Expected result:**
- Each action completes without error and the row updates immediately.
- The newly invited user can log in with the temporary password.
- Deactivated users cannot log in.
- Telefonista and Rufero cannot open `/admin/users` — they get redirected or see an access denied page.

- [ ] **Pass / Fail**
- Issues:

---

### Story 8.3 — Multi-tenant isolation

**As an** Owner,
**I want** to be 100% sure another tenant cannot see my data,
**so that** I trust the platform with my business.

**Prerequisites:** Dev team provides a second seeded tenant ("Tenant B") and an owner login for it.

**Steps to test:**
1. Log in as **Tenant A Owner**. Note the total prospect count.
2. Log out. Log in as **Tenant B Owner**.
3. Review dashboard counts and any prospect URL pattern you remember from Tenant A.
4. Try to visit a Tenant A prospect URL directly (e.g. `/prospects/<tenant-a-id>`).

**Expected result:**
- Tenant B sees only their own data; totals differ from Tenant A.
- Opening a Tenant A prospect URL while logged in as Tenant B returns "not found" (never leaks data).

- [ ] **Pass / Fail**
- Issues:

---