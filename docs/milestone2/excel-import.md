# Excel Prospect Import

## Purpose
Allow users to bulk-import prospects by uploading an Excel (.xlsx, .xls) or CSV file. This follows the same column mapping and data transformation logic used in the seed script (`docs/seed/README.md`), so any hail damage list from the same data provider works out of the box.

## How It Works

### 1. Upload
User uploads a file at `/new-leads/import`. The server reads the file using SheetJS (`xlsx` package) and auto-detects column mappings.

### 2. Preview
Before importing, the user sees:
- **Summary cards**: total rows, valid rows, rows that will be skipped
- **Column mapping**: which Excel headers map to which prospect fields (auto-detected with fuzzy matching)
- **Preview table**: first 10 rows with parsed values and skip/ready status
- Skip reasons: missing name, PO Box address

### 3. Import
On confirmation, the server action:
- Parses all rows with the same field mapping
- Inserts in batches of 200 rows for performance
- Sets `status = 'new_leads'`, `source = 'excel_import'`, `created_by = current user`
- DNC logic: if DNC or Cell_DNC column is `true`/`yes`/`1`, sets `do_not_call = true` with reason `imported_dnc_list`
- Logs an activity entry with `type = 'prospect_update'` and metadata including file name, imported/skipped counts
- Revalidates `/new-leads`, `/prospects`, and `/` routes

### 4. Results
After import, user sees imported/skipped counts with any batch errors, and can import another file or navigate to New Leads.

## Column Mapping

The system matches Excel headers using fuzzy aliases. Supported mappings:

| Prospect Field | Accepted Excel Headers |
|---|---|
| name | Name, FullName, Full Name |
| firstName + lastName | FirstName, First Name + LastName, Last Name |
| address | Address, Street, StreetAddress |
| city | City |
| state | State, ST |
| zip | Zip, ZipCode, Zip Code, Postal |
| phone | Phone, PhoneNumber, Phone Number |
| mobile | Mobile, MobileNumber, Cell, CellPhone |
| email | Email, EmailAddress, E-mail |
| homeValue | HomeValue, Home Value, PropertyValue, Value |
| hailSize | HailSize, Hail Size, Hail Size Inches |
| latitude/longitude | Latitude, Lat / Longitude, Lon, Lng |
| DNC | DNC, Do_Not_Call, DoNotCall |
| cellDnc | Cell_DNC, CellDNC, Mobile_DNC |
| stormDate | StormDate, Storm Date |
| windSpeed | WindSpeed, Wind Speed, Wind Speed MPH |
| tipo | Tipo, Type, PropertyType |
| source | Source, LeadSource |

Headers are matched case-insensitively with spaces/underscores normalized.

## Data Transformations
- **Name**: FirstName + LastName concatenated and title-cased, or FullName title-cased
- **Phone**: Stripped to digits only, must be >= 10 digits
- **Home value**: `$` and `,` stripped, parsed as number
- **Coordinates**: Stored as PostgreSQL `point(lon, lat)` format
- **PO Box**: Rows with addresses starting with "PO Box" are skipped (no roof to inspect)
- **Storm date + wind speed**: Stored in `tags` array as `storm:2025-05-18`, `wind:65mph`

## Access Points
- **Dashboard**: "Import Excel" button in the header quick-actions
- **New Leads page**: "Import" button in the filter toolbar
- **Direct URL**: `/new-leads/import`

## Files Created
- `apps/web/app/(dashboard)/new-leads/import/page.tsx` — Page wrapper
- `apps/web/app/(dashboard)/new-leads/import/actions.ts` — Server actions: `parseExcelFile()`, `importExcelFile()`
- `apps/web/app/(dashboard)/new-leads/import/import-prospects.tsx` — Client component with multi-step UI

## Files Modified
- `apps/web/app/(dashboard)/page.tsx` — Added "Import Excel" button to dashboard header
- `apps/web/components/shared/prospect-list-view.tsx` — Added "Import" button to New Leads filter bar

## Dependencies Added
- `xlsx` (SheetJS) v0.18.5 — Excel/CSV parsing library
