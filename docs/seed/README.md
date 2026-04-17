# Prospect Seed Data — NWA Hail Damage List

## Purpose

Seed the `prospects` table with realistic data so the M2 prospects list page has
something to render. Without seed data, filters/pagination/search are untestable.
Per the project's M2 gating plan, seed data is a prerequisite for UI work.

## Source

- **File:** `NWA hail damage 05182025.xlsx` (root of repo)
- **Sheet:** `RESIDENTIAL DATA`
- **Rows:** 54,022 residential homeowner records across AR (95%) and OK (5%)
- **Columns:** 23 (name, address, phones, homeowner info, hail size, storm date, DNC flags, etc.)

## Task Breakdown

### 1. Schema Analysis

The existing `prospects` table (`supabase/migrations/002_core_tables.sql`) was
reviewed. No schema changes were needed — every field we care about from the
spreadsheet already has a home. See mapping below.

### 2. Schema vs Excel — Field Mapping

| Excel column              | Prospects column           | Transformation                                         |
| ------------------------- | -------------------------- | ------------------------------------------------------ |
| `FirstName` + `LastName`  | `name` (text)              | Concatenate, title-case, fallback to `Unknown`         |
| `Address`                 | `address` (text)           | Passed through; **PO Box rows dropped** (no roof)      |
| `City`                    | `city` (text)              | —                                                      |
| `State`                   | `state` (text)             | Also drives tenant split (see below)                   |
| `ZipCode`                 | `zip` (text)               | Kept as text to preserve leading zeros                 |
| `PhoneNumber` + `MobileNumber` | `phones` (text[])     | Digits-only, ≥10 digits, combined into array           |
| `EmailAddress`            | `email` (text)             | Lowercased                                             |
| `HomeValue` (`"$153,000"`)| `home_value` (numeric)     | Strip `$` and `,`                                      |
| `Latitude`, `Longitude`   | `coordinates` (point)      | `point(lon, lat)`                                      |
| `DNC` OR `Cell_DNC`       | `do_not_call` (boolean)    | `true` if **either** flag is set                       |
| —                         | `do_not_call_reason`       | `'imported_dnc_list'` when `do_not_call = true`        |
| `Hail Size Inches`        | `hail_size` (numeric)      | —                                                      |
| `Storm Date` + `Wind Speed MPH` | `tags` (text[])      | Stored as `storm:2025-05-18`, `wind:65mph`             |
| —                         | `status`                   | Hard-coded `'new_leads'`                               |
| —                         | `tipo`                     | Hard-coded `'residential'`                             |
| —                         | `source`                   | Hard-coded `'hail_damage_list_2025'`                   |

**Dropped (no schema home, not needed for M2):** `Gender`, `HomeownerConfirmed`,
`LengthOfResidence`, `AddressHash`, `HeadOfHousehold`, `Vehicles`.

### 3. Multi-Tenant Strategy

Row-level `tenant_id` on every table (already enforced by RLS in
`006_rls.sql`). Two tenants are created with stable UUIDs for reproducibility:

| Tenant                  | UUID                                     | Slug            | Gets             |
| ----------------------- | ---------------------------------------- | --------------- | ---------------- |
| NWA Roofing Co          | `11111111-1111-1111-1111-111111111111`   | `nwa-roofing`   | 150 AR prospects |
| Ozark Roofing Co        | `22222222-2222-2222-2222-222222222222`   | `ozark-roofing` | 150 OK prospects |

**Why split by state:** natural geographic separation mirrors how a real
multi-tenant SaaS would slice the book; also lets RLS be visually verified (log
in as tenant 1 → see only AR rows).

### 4. Seed Volume

The spreadsheet has 54k rows — too many for a dev DB. We sample **150 rows per
tenant = 300 total**, shuffled with a fixed seed (`random.seed(42)`) for
reproducibility. Tune in the generator script if more load is needed.

### 5. Output Files

- `supabase/migrations/999_seed_prospects.sql` — idempotent seed migration
  (wrapped in `BEGIN/COMMIT`, tenants use `ON CONFLICT DO NOTHING`).

## How to Run

```bash
# Local Supabase
supabase db reset           # applies all migrations including the seed
# or apply just the seed
psql "$DATABASE_URL" -f supabase/migrations/999_seed_prospects.sql
```

## Regenerating the Seed

The generator is inlined in this doc for traceability. To regenerate with a
different sample size or different state split, edit and re-run:

```python
# requires: pip install openpyxl
import openpyxl, re, random
random.seed(42)
wb = openpyxl.load_workbook('NWA hail damage 05182025.xlsx', read_only=True, data_only=True)
ws = wb['RESIDENTIAL DATA']
# ... see commit history for full script ...
```

(The full script was run once and the output committed; we do not keep it as a
live tool since `openpyxl` isn't a project dependency.)

## Assumptions

1. **PO Box rows are dropped.** A PO Box has no roof to inspect, so it has no
   business being in a roofing CRM's prospect table.
2. **DNC is the union of `DNC` and `Cell_DNC`.** Safer to over-flag than to call
   someone on a suppression list — the SRS is strict about DNC compliance.
3. **`status = 'new_leads'` for every row.** Consistent with the "import list"
   flow; users move prospects out of `new_leads` as they work them.
4. **No user assignment at seed time.** `assigned_to`/`created_by` are NULL;
   tenants will assign after seeding their own users.
5. **Storm Date and Wind Speed live in `tags`** because there are no dedicated
   columns and they're informational, not queryable-critical.
6. **`LengthOfResidence`, `Vehicles`, `Gender`, etc. are discarded.** They are
   not in the SRS and would need new columns to store — out of scope.
7. **Home values are whole dollars.** The Excel strings like `"$153,000"` are
   stripped to integer `numeric`; cents would be fake precision.

## Next Steps (Not Done Here)

- Generate TypeScript types from the schema (`supabase gen types typescript`)
  — the second gate in the M2 plan (see `photo_2026-04-11_21-08-48.jpg`).
- Seed users for each tenant so `assigned_to` can be backfilled.
