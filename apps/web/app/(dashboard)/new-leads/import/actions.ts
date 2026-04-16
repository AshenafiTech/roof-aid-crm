"use server";

import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";

import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types/auth";

// ── Column mapping (same logic as seed script) ──────────────────────
// We try multiple common header names for each field so users don't
// have to rename their columns before uploading.

const HEADER_ALIASES: Record<string, string[]> = {
  firstName: ["firstname", "first_name", "first name", "fname"],
  lastName: ["lastname", "last_name", "last name", "lname"],
  name: ["name", "full_name", "fullname", "full name"],
  address: ["address", "street", "street_address", "streetaddress"],
  city: ["city"],
  state: ["state", "st"],
  zip: ["zip", "zipcode", "zip_code", "zip code", "postal", "postal_code"],
  phone: ["phone", "phonenumber", "phone_number", "phone number", "phone1"],
  mobile: [
    "mobile",
    "mobilenumber",
    "mobile_number",
    "mobile number",
    "cell",
    "cellphone",
    "cell_phone",
  ],
  email: ["email", "emailaddress", "email_address", "e-mail"],
  homeValue: [
    "homevalue",
    "home_value",
    "home value",
    "property_value",
    "propertyvalue",
    "value",
  ],
  hailSize: [
    "hailsize",
    "hail_size",
    "hail size",
    "hail size inches",
    "hailsizeinches",
    "hail_size_inches",
  ],
  latitude: ["latitude", "lat"],
  longitude: ["longitude", "lon", "lng", "long"],
  dnc: ["dnc", "do_not_call", "donotcall"],
  cellDnc: ["cell_dnc", "celldnc", "mobile_dnc"],
  stormDate: ["stormdate", "storm_date", "storm date"],
  windSpeed: ["windspeed", "wind_speed", "wind speed", "wind speed mph"],
  tipo: ["tipo", "type", "property_type", "propertytype"],
  source: ["source", "lead_source", "leadsource"],
};

function matchHeader(
  header: string,
  aliases: Record<string, string[]>,
): string | null {
  const norm = header.toLowerCase().trim().replace(/[^a-z0-9_]/g, "");
  for (const [field, names] of Object.entries(aliases)) {
    for (const alias of names) {
      if (norm === alias.replace(/[^a-z0-9_]/g, "")) return field;
    }
  }
  return null;
}

function cleanPhone(raw: unknown): string | null {
  if (raw == null) return null;
  const digits = String(raw).replace(/\D/g, "");
  return digits.length >= 10 ? digits : null;
}

function cleanMoney(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return raw;
  const cleaned = String(raw).replace(/[$,\s]/g, "");
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : null;
}

function cleanNumber(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return raw;
  const num = parseFloat(String(raw));
  return Number.isFinite(num) ? num : null;
}

function titleCase(s: string): string {
  return s.replace(
    /\w\S*/g,
    (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase(),
  );
}

export type PreviewRow = {
  row: number;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  homeValue: number | null;
  hailSize: number | null;
  skip: boolean;
  skipReason: string | null;
};

export type ParseResult = {
  headers: string[];
  mapping: Record<string, string | null>;
  preview: PreviewRow[];
  totalRows: number;
  validRows: number;
  skippedRows: number;
};

export async function parseExcelFile(formData: FormData): Promise<ParseResult> {
  const file = formData.get("file") as File | null;
  if (!file) throw new Error("No file uploaded");

  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext !== "xlsx" && ext !== "xls" && ext !== "csv") {
    throw new Error("Please upload an .xlsx, .xls, or .csv file");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("Workbook has no sheets");

  const sheet = wb.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
  });

  if (rawRows.length === 0) throw new Error("Sheet is empty");

  // Auto-detect column mapping
  const headers = Object.keys(rawRows[0] ?? {});
  const mapping: Record<string, string | null> = {};
  for (const h of headers) {
    mapping[h] = matchHeader(h, HEADER_ALIASES);
  }

  // Build preview (first 10 rows + stats for all)
  const preview: PreviewRow[] = [];
  let validRows = 0;
  let skippedRows = 0;

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const get = (field: string): unknown => {
      const col = Object.entries(mapping).find(([, v]) => v === field)?.[0];
      return col ? raw[col] : undefined;
    };

    // Build name
    const firstName = get("firstName");
    const lastName = get("lastName");
    const fullName = get("name");
    let name = "";
    if (firstName || lastName) {
      name = [firstName, lastName]
        .filter(Boolean)
        .map((s) => titleCase(String(s).trim()))
        .join(" ");
    } else if (fullName) {
      name = titleCase(String(fullName).trim());
    }

    const address = get("address") ? String(get("address")).trim() : null;
    const city = get("city") ? String(get("city")).trim() : null;
    const state = get("state") ? String(get("state")).trim() : null;
    const phone = cleanPhone(get("phone")) ?? cleanPhone(get("mobile"));
    const email = get("email")
      ? String(get("email")).trim().toLowerCase()
      : null;
    const homeValue = cleanMoney(get("homeValue"));
    const hailSize = cleanNumber(get("hailSize"));

    // Skip conditions
    let skip = false;
    let skipReason: string | null = null;

    if (!name) {
      skip = true;
      skipReason = "No name";
    } else if (
      address &&
      /^po\s*box/i.test(address)
    ) {
      skip = true;
      skipReason = "PO Box address";
    }

    if (skip) {
      skippedRows++;
    } else {
      validRows++;
    }

    if (i < 10) {
      preview.push({
        row: i + 2, // 1-indexed + header row
        name: name || "(empty)",
        address,
        city,
        state,
        phone,
        email,
        homeValue,
        hailSize,
        skip,
        skipReason,
      });
    }
  }

  return {
    headers,
    mapping,
    preview,
    totalRows: rawRows.length,
    validRows,
    skippedRows,
  };
}

export type ImportResult = {
  imported: number;
  skipped: number;
  errors: string[];
};

export async function importExcelFile(formData: FormData): Promise<ImportResult> {
  const file = formData.get("file") as File | null;
  if (!file) throw new Error("No file uploaded");

  // Auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("id, tenant_id, role")
    .eq("id", user.id)
    .single();
  if (profileError || !profile) throw new Error("Profile not found");

  // Parse
  const buffer = Buffer.from(await file.arrayBuffer());
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("Workbook has no sheets");

  const sheet = wb.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
  });

  // Auto-detect mapping
  const headers = Object.keys(rawRows[0] ?? {});
  const mapping: Record<string, string | null> = {};
  for (const h of headers) {
    mapping[h] = matchHeader(h, HEADER_ALIASES);
  }

  const get = (raw: Record<string, unknown>, field: string): unknown => {
    const col = Object.entries(mapping).find(([, v]) => v === field)?.[0];
    return col ? raw[col] : undefined;
  };

  // Build inserts
  const BATCH_SIZE = 200;
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];
  const batch: Record<string, unknown>[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];

    // Name
    const firstName = get(raw, "firstName");
    const lastName = get(raw, "lastName");
    const fullName = get(raw, "name");
    let name = "";
    if (firstName || lastName) {
      name = [firstName, lastName]
        .filter(Boolean)
        .map((s) => titleCase(String(s).trim()))
        .join(" ");
    } else if (fullName) {
      name = titleCase(String(fullName).trim());
    }

    if (!name) {
      skipped++;
      continue;
    }

    const address = get(raw, "address")
      ? String(get(raw, "address")).trim()
      : null;

    // Skip PO Boxes
    if (address && /^po\s*box/i.test(address)) {
      skipped++;
      continue;
    }

    const city = get(raw, "city") ? String(get(raw, "city")).trim() : null;
    const state = get(raw, "state") ? String(get(raw, "state")).trim() : null;
    const zip = get(raw, "zip") ? String(get(raw, "zip")).trim() : null;

    const phone1 = cleanPhone(get(raw, "phone"));
    const phone2 = cleanPhone(get(raw, "mobile"));
    const phones = [phone1, phone2].filter(Boolean) as string[];

    const email = get(raw, "email")
      ? String(get(raw, "email")).trim().toLowerCase()
      : null;

    const homeValue = cleanMoney(get(raw, "homeValue"));
    const hailSize = cleanNumber(get(raw, "hailSize"));
    const lat = cleanNumber(get(raw, "latitude"));
    const lon = cleanNumber(get(raw, "longitude"));

    const dncRaw = get(raw, "dnc");
    const cellDncRaw = get(raw, "cellDnc");
    const isDnc =
      dncRaw === true ||
      dncRaw === 1 ||
      String(dncRaw).toLowerCase() === "true" ||
      String(dncRaw).toLowerCase() === "yes" ||
      cellDncRaw === true ||
      cellDncRaw === 1 ||
      String(cellDncRaw).toLowerCase() === "true" ||
      String(cellDncRaw).toLowerCase() === "yes";

    const tags: string[] = [];
    const stormDate = get(raw, "stormDate");
    if (stormDate) {
      if (stormDate instanceof Date) {
        tags.push(`storm:${stormDate.toISOString().split("T")[0]}`);
      } else {
        tags.push(`storm:${String(stormDate)}`);
      }
    }
    const windSpeed = get(raw, "windSpeed");
    if (windSpeed) tags.push(`wind:${String(windSpeed)}mph`);

    const tipo = get(raw, "tipo")
      ? String(get(raw, "tipo")).trim()
      : "residential";
    const source = get(raw, "source")
      ? String(get(raw, "source")).trim()
      : "excel_import";

    const row: Record<string, unknown> = {
      tenant_id: profile.tenant_id,
      name,
      address,
      city,
      state,
      zip,
      phones: phones.length > 0 ? phones : [],
      email,
      home_value: homeValue,
      hail_size: hailSize,
      status: "new_leads",
      tipo,
      source,
      do_not_call: isDnc,
      do_not_call_reason: isDnc ? "imported_dnc_list" : null,
      do_not_call_at: isDnc ? new Date().toISOString() : null,
      tags: tags.length > 0 ? tags : null,
      created_by: profile.id,
    };

    if (lat != null && lon != null) {
      // Supabase accepts point as string "({x},{y})"
      row.coordinates = `(${lon},${lat})`;
    }

    batch.push(row);

    // Flush batch
    if (batch.length >= BATCH_SIZE) {
      const { error: insertErr } = await supabase
        .from("prospects")
        .insert(batch as never[]);
      if (insertErr) {
        errors.push(`Batch at row ${i + 2}: ${insertErr.message}`);
        skipped += batch.length;
      } else {
        imported += batch.length;
      }
      batch.length = 0;
    }
  }

  // Final batch
  if (batch.length > 0) {
    const { error: insertErr } = await supabase
      .from("prospects")
      .insert(batch as never[]);
    if (insertErr) {
      errors.push(`Final batch: ${insertErr.message}`);
      skipped += batch.length;
    } else {
      imported += batch.length;
    }
  }

  // Log activity
  if (imported > 0) {
    await supabase.from("activities").insert({
      tenant_id: profile.tenant_id,
      user_id: profile.id,
      type: "prospect_update",
      metadata: {
        action: "excel_import",
        fileName: file.name,
        imported,
        skipped,
      },
    });
  }

  revalidatePath("/new-leads");
  revalidatePath("/prospects");
  revalidatePath("/");

  return { imported, skipped, errors };
}
