import { createClient } from "@/lib/supabase/server";

export type CallLogRow = {
  id: string;
  tenant_id: string;
  prospect_id: string | null;
  agent_id: string | null;
  direction: "inbound" | "outbound";
  from_number: string | null;
  to_number: string | null;
  duration_seconds: number | null;
  disposition: string | null;
  recording_url: string | null;
  recording_storage_path: string | null;
  telnyx_call_id: string | null;
  hangup_cause: string | null;
  started_at: string | null;
  answered_at: string | null;
  ended_at: string | null;
  created_at: string | null;
  prospect?: { id: string; name: string | null } | null;
  agent?: { id: string; first_name: string | null; last_name: string | null } | null;
};

export type SmsLogRow = {
  id: string;
  tenant_id: string;
  prospect_id: string | null;
  agent_id: string | null;
  direction: "inbound" | "outbound";
  from_number: string | null;
  to_number: string | null;
  body: string | null;
  status: string | null;
  segments: number | null;
  error_code: string | null;
  media_urls: string[] | null;
  created_at: string | null;
  prospect?: { id: string; name: string | null } | null;
  agent?: { id: string; first_name: string | null; last_name: string | null } | null;
};

export const SMS_PAGE_SIZE = 20;
export const CALL_PAGE_SIZE = 20;

type ProspectMap = Map<string, { id: string; name: string | null }>;
type AgentMap = Map<string, { id: string; first_name: string | null; last_name: string | null }>;

async function loadRelations(
  supabase: Awaited<ReturnType<typeof createClient>>,
  prospectIds: string[],
  agentIds: string[],
): Promise<{ prospects: ProspectMap; agents: AgentMap }> {
  const prospects: ProspectMap = new Map();
  const agents: AgentMap = new Map();

  if (prospectIds.length > 0) {
    const { data } = await supabase
      .from("prospects")
      .select("id, name")
      .in("id", prospectIds);
    for (const p of data ?? []) {
      prospects.set(p.id, { id: p.id, name: p.name });
    }
  }
  if (agentIds.length > 0) {
    const { data } = await supabase
      .from("users")
      .select("id, first_name, last_name")
      .in("id", agentIds);
    for (const u of data ?? []) {
      agents.set(u.id, {
        id: u.id,
        first_name: u.first_name,
        last_name: u.last_name,
      });
    }
  }
  return { prospects, agents };
}

export async function listCallLogs(
  tenantId: string,
  opts: { page?: number; pageSize?: number } = {},
): Promise<{ logs: CallLogRow[]; total: number; page: number; pageSize: number }> {
  const supabase = await createClient();
  const pageSize = opts.pageSize ?? CALL_PAGE_SIZE;
  const page = Math.max(1, opts.page ?? 1);
  const offset = (page - 1) * pageSize;

  const { data, count, error } = await supabase
    .from("call_logs")
    .select("*", { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (error) {
    console.error("[listCallLogs]", error);
    return { logs: [], total: 0, page, pageSize };
  }

  const rows = (data ?? []) as unknown as CallLogRow[];
  const prospectIds = Array.from(
    new Set(rows.map((r) => r.prospect_id).filter((x): x is string => !!x)),
  );
  const agentIds = Array.from(
    new Set(rows.map((r) => r.agent_id).filter((x): x is string => !!x)),
  );
  const { prospects, agents } = await loadRelations(supabase, prospectIds, agentIds);

  const logs = rows.map((r) => ({
    ...r,
    prospect: r.prospect_id ? prospects.get(r.prospect_id) ?? null : null,
    agent: r.agent_id ? agents.get(r.agent_id) ?? null : null,
  }));

  return { logs, total: count ?? 0, page, pageSize };
}

export async function listSmsLogs(
  tenantId: string,
  opts: { page?: number; pageSize?: number } = {},
): Promise<{ logs: SmsLogRow[]; total: number; page: number; pageSize: number }> {
  const supabase = await createClient();
  const pageSize = opts.pageSize ?? SMS_PAGE_SIZE;
  const page = Math.max(1, opts.page ?? 1);
  const offset = (page - 1) * pageSize;

  const { data, count, error } = await supabase
    .from("sms_logs")
    .select(
      "id, tenant_id, prospect_id, agent_id, direction, from_number, to_number, body, status, segments, error_code, media_urls, created_at",
      { count: "exact" },
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (error) {
    console.error("[listSmsLogs]", error);
    return { logs: [], total: 0, page, pageSize };
  }

  const rows = (data ?? []) as unknown as SmsLogRow[];
  const prospectIds = Array.from(
    new Set(rows.map((r) => r.prospect_id).filter((x): x is string => !!x)),
  );
  const agentIds = Array.from(
    new Set(rows.map((r) => r.agent_id).filter((x): x is string => !!x)),
  );
  const { prospects, agents } = await loadRelations(supabase, prospectIds, agentIds);

  const logs = rows.map((r) => ({
    ...r,
    prospect: r.prospect_id ? prospects.get(r.prospect_id) ?? null : null,
    agent: r.agent_id ? agents.get(r.agent_id) ?? null : null,
  }));

  return { logs, total: count ?? 0, page, pageSize };
}
