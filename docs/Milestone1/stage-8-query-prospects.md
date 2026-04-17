# Stage 8 — Querying the `prospects` Endpoint

How to query the 300 seeded prospects on the remote Supabase project
(`ivmfmpscdimyepbvrbee`) via the PostgREST auto-generated REST API.

## Seeded Data Recap

| Tenant            | UUID                                     | Rows | State |
| ----------------- | ---------------------------------------- | ---- | ----- |
| NWA Roofing Co    | `11111111-1111-1111-1111-111111111111`   | 150  | AR    |
| Ozark Roofing Co  | `22222222-2222-2222-2222-222222222222`   | 150  | OK    |

- All rows: `status = 'new_leads'`, `tipo = 'residential'`, `source = 'hail_damage_list_2025'`
- 70 rows are `do_not_call = true`
- Tags contain `storm:2025-05-18` and `wind:<mph>mph`
- `coordinates` is a Postgres `point(lon, lat)`

## Base URL and Headers

```bash
BASE="https://ivmfmpscdimyepbvrbee.supabase.co/rest/v1"
# Service role (server-side, bypasses RLS — use only from trusted environments)
SRK="$SUPABASE_SERVICE_ROLE_KEY"
# Anon (client-side, enforces RLS — used by the web/mobile apps)
ANON="$NEXT_PUBLIC_SUPABASE_ANON_KEY"

AUTH=(-H "apikey: $SRK" -H "Authorization: Bearer $SRK")
```

**Important:** The anon key enforces RLS (`006_rls.sql`), so client apps can
only read rows for the tenant the logged-in user belongs to. The service role
key bypasses RLS — use it only from server-side code and never ship it to a
browser or mobile app.

## 1. List prospects for a single tenant

```bash
curl -s "${AUTH[@]}" \
  "$BASE/prospects?tenant_id=eq.11111111-1111-1111-1111-111111111111&select=id,name,city,state,phones,do_not_call&order=created_at.desc&limit=20"
```

PostgREST operators used:
- `eq.` — equals
- `order=created_at.desc` — newest first
- `limit=20` — pagination window

## 2. Get a prospect by ID

```bash
curl -s "${AUTH[@]}" \
  "$BASE/prospects?id=eq.<UUID>&select=*"
```

Add `&select=id,name,address,city,state,zip,coordinates,phones,email,home_value,hail_size,status,tags`
to get the full wire-friendly payload without unused columns.

## 3. Pagination (60-record cap per SRS)

SRS mandates a 60-record page size. PostgREST supports either `limit/offset`
query params or `Range` headers:

```bash
# Query param style
curl -s "${AUTH[@]}" \
  "$BASE/prospects?tenant_id=eq.<UUID>&order=created_at.desc&limit=60&offset=0"

# Range header style (gives you total count in Content-Range)
curl -s -I "${AUTH[@]}" \
  -H "Prefer: count=exact" -H "Range: 0-59" \
  "$BASE/prospects?tenant_id=eq.<UUID>&order=created_at.desc"
# → Content-Range: 0-59/150
```

## 4. Filter by status / type / source

```bash
# All new leads for tenant 1
curl -s "${AUTH[@]}" \
  "$BASE/prospects?tenant_id=eq.11111111-1111-1111-1111-111111111111&status=eq.new_leads&select=id,name"

# Multiple statuses (IN)
"$BASE/prospects?status=in.(new_leads,contacted,appointment_set)"
```

## 5. Full-text-ish search on name / address

```bash
# ILIKE — case-insensitive substring
curl -s "${AUTH[@]}" \
  "$BASE/prospects?name=ilike.*brice*&select=id,name,city"

# Across multiple columns — use or=
"$BASE/prospects?or=(name.ilike.*brice*,address.ilike.*brice*,email.ilike.*brice*)"
```

## 6. DNC-aware queries

The UI should never display callable lists that include DNC rows. Filter them
out at the query layer:

```bash
curl -s "${AUTH[@]}" \
  "$BASE/prospects?tenant_id=eq.<UUID>&do_not_call=eq.false&select=id,name,phones"
```

To audit DNC rows separately:

```bash
curl -s "${AUTH[@]}" \
  "$BASE/prospects?do_not_call=eq.true&select=id,name,do_not_call_reason,do_not_call_at"
```

## 7. Geographic filters (city, state, zip)

```bash
# By city
"$BASE/prospects?city=eq.Springdale&state=eq.AR"

# Zip prefix (Arkansas 727xx)
"$BASE/prospects?zip=like.727*"

# Multiple zips
"$BASE/prospects?zip=in.(72761,72762,72764)"
```

## 8. Hail-size / home-value ranges

```bash
# Hail ≥ 1.5"
"$BASE/prospects?hail_size=gte.1.5"

# Home value between 200k and 400k
"$BASE/prospects?and=(home_value.gte.200000,home_value.lte.400000)"
```

## 9. Array columns (`phones`, `tags`)

```bash
# Rows tagged with the May 2025 storm
"$BASE/prospects?tags=cs.{storm:2025-05-18}"
#          ^^^ cs = "contains" — Postgres array @> operator

# Rows with at least one phone number (i.e. phones array is non-empty)
"$BASE/prospects?phones=not.eq.{}"
```

## 10. Counting rows

```bash
curl -s -I "${AUTH[@]}" \
  -H "Prefer: count=exact" -H "Range: 0-0" \
  "$BASE/prospects?tenant_id=eq.<UUID>"
# → Content-Range: 0-0/150
```

Use `count=planned` for an estimate (faster on huge tables) or
`count=estimated` for a hybrid.

## 11. From the Next.js web app (supabase-js)

```ts
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// RLS automatically scopes to the logged-in user's tenant
const { data, error, count } = await supabase
  .from("prospects")
  .select("id, name, city, state, phones, do_not_call", { count: "exact" })
  .eq("status", "new_leads")
  .eq("do_not_call", false)
  .order("created_at", { ascending: false })
  .range(0, 59);          // 60-record page per SRS
```

Filter helpers (all chainable):

```ts
.eq("city", "Springdale")
.in("status", ["new_leads", "contacted"])
.ilike("name", "%brice%")
.gte("hail_size", 1.5)
.contains("tags", ["storm:2025-05-18"])
.or("name.ilike.%brice%,email.ilike.%brice%")
```

## 12. From Flutter (supabase-flutter)

```dart
final data = await supabase
  .from('prospects')
  .select('id, name, city, phones, do_not_call')
  .eq('status', 'new_leads')
  .eq('do_not_call', false)
  .order('created_at', ascending: false)
  .range(0, 59);
```

## Quick Reference — PostgREST Operators

| Operator | SQL        | Example                          |
| -------- | ---------- | -------------------------------- |
| `eq`     | `=`        | `status=eq.new_leads`            |
| `neq`    | `<>`       | `status=neq.closed`              |
| `gt`     | `>`        | `hail_size=gt.1`                 |
| `gte`    | `>=`       | `home_value=gte.200000`          |
| `lt`     | `<`        | `hail_size=lt.2`                 |
| `lte`    | `<=`       | `home_value=lte.500000`          |
| `like`   | `LIKE`     | `zip=like.727*`                  |
| `ilike`  | `ILIKE`    | `name=ilike.*brice*`             |
| `in`     | `IN`       | `status=in.(new_leads,contacted)` |
| `is`     | `IS`       | `email=is.null`                  |
| `cs`     | `@>`       | `tags=cs.{storm:2025-05-18}`     |
| `cd`     | `<@`       | `tags=cd.{a,b,c}`                |
| `or`     | `OR`       | `or=(a.eq.1,b.eq.2)`             |
| `and`    | `AND`      | `and=(a.gte.1,a.lte.9)`          |

## Smoke-test Checklist

Run these to confirm the seed is intact and the endpoint is reachable:

```bash
# 1. Total prospect count = 300
curl -s -I "${AUTH[@]}" -H "Prefer: count=exact" -H "Range: 0-0" \
  "$BASE/prospects?select=id" | grep -i content-range

# 2. Tenant 1 = 150
curl -s -I "${AUTH[@]}" -H "Prefer: count=exact" -H "Range: 0-0" \
  "$BASE/prospects?select=id&tenant_id=eq.11111111-1111-1111-1111-111111111111" | grep -i content-range

# 3. Tenant 2 = 150
curl -s -I "${AUTH[@]}" -H "Prefer: count=exact" -H "Range: 0-0" \
  "$BASE/prospects?select=id&tenant_id=eq.22222222-2222-2222-2222-222222222222" | grep -i content-range

# 4. DNC rows = 70
curl -s -I "${AUTH[@]}" -H "Prefer: count=exact" -H "Range: 0-0" \
  "$BASE/prospects?select=id&do_not_call=eq.true" | grep -i content-range

# 5. Sample payload
curl -s "${AUTH[@]}" \
  "$BASE/prospects?select=name,city,state,phones,tags&limit=3"
```

Expected: `300`, `150`, `150`, `70`, and 3 JSON rows.
