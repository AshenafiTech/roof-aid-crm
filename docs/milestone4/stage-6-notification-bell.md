# Stage 6 — Notification Bell

**Goal:** Bell icon in the web nav bar with a real-time unread count, dropdown feed of recent notifications, mark-as-read, and click-through to the relevant record.

**Outcome:** Telefonistas don't have to scan the prospects list to see "did anyone reply to my SMS?" The bell tells them.

**Estimated time:** 0.5–1 day

---

## 1. Scope

The `notifications` table already exists from M1 and is being populated by Stages 2–4 (incoming call, incoming SMS, email bounce, etc.). This stage is **only the consumer UI** — no schema changes.

| Feature | Where |
|---------|-------|
| Bell icon with unread badge | Nav bar, top-right |
| Dropdown panel of last 20 notifications | Below bell |
| Click notification → mark read + navigate | Each row |
| "Mark all as read" link | Header of dropdown |
| Real-time unread count | Realtime subscription on `notifications` |

---

## 2. Schema verification (no changes needed, just confirm)

```sql
-- Should already exist.
\d notifications
-- Expected:
-- id, tenant_id, user_id, kind, payload, read_at, created_at
```

Notification kinds already produced by other stages:
- `sms_received` (Stage 3 inbound webhook)
- `call_inbound` (Stage 2 inbound webhook, when no agent online to take it)
- `email_bounced` (Stage 4 webhook)
- `appointment_scheduled` (M5 producer; consumer renders here)
- `dnc_set` (Stage 5 STOP-keyword auto-DNC)

If new producers want to fire from M5+, they just insert; the bell handles them via a `kind` → copy/icon table.

---

## 3. Routing config

A single object maps `kind` to display + navigation:

```ts
// apps/web/lib/notifications/registry.ts
export type NotificationDescriptor = {
  icon: LucideIcon;
  iconColor: string;
  title: (payload: any) => string;
  body: (payload: any) => string;
  href: (payload: any) => string;
};

export const REGISTRY: Record<string, NotificationDescriptor> = {
  sms_received: {
    icon: MessageSquare, iconColor: 'text-violet-500',
    title: (p) => `${p.prospect_name ?? 'Unknown'} sent an SMS`,
    body: (p) => p.body.slice(0, 80),
    href: (p) => `/prospects/${p.prospect_id}/sms`,
  },
  call_inbound: {
    icon: Phone, iconColor: 'text-emerald-500',
    title: (p) => `Missed call from ${p.from}`,
    body: (p) => p.prospect_name ? `Matched to ${p.prospect_name}` : 'No prospect match',
    href: (p) => p.prospect_id ? `/prospects/${p.prospect_id}/calls` : '/communications/missed',
  },
  email_bounced: {
    icon: AlertTriangle, iconColor: 'text-amber-500',
    title: () => 'Email bounced',
    body: (p) => p.bounce_reason ?? 'Unknown reason',
    href: (p) => `/prospects/${p.prospect_id}/email`,
  },
  appointment_scheduled: {
    icon: Calendar, iconColor: 'text-blue-500',
    title: (p) => `Appointment scheduled for ${p.prospect_name}`,
    body: (p) => formatDate(p.scheduled_at),
    href: (p) => `/appointments/${p.appointment_id}`,
  },
  dnc_set: {
    icon: Ban, iconColor: 'text-red-500',
    title: (p) => `${p.prospect_name} replied STOP`,
    body: () => 'Prospect auto-flagged DNC',
    href: (p) => `/prospects/${p.prospect_id}`,
  },
};
```

Adding a new notification type later = add one entry.

---

## 4. Hook + component

### `useNotifications()` hook

```ts
// apps/web/lib/hooks/use-notifications.ts
export function useNotifications(userId: string) {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['notifications', userId],
    queryFn: async () => {
      const supa = createBrowserClient();
      const { data } = await supa.from('notifications')
        .select('*').eq('user_id', userId)
        .order('created_at', { ascending: false }).limit(20);
      return data ?? [];
    },
  });

  useEffect(() => {
    const supa = createBrowserClient();
    const ch = supa.channel(`notifications:${userId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => queryClient.invalidateQueries({ queryKey: ['notifications', userId] })
      )
      .subscribe();
    return () => { supa.removeChannel(ch); };
  }, [userId]);

  const unreadCount = data?.filter(n => !n.read_at).length ?? 0;
  return { notifications: data ?? [], unreadCount };
}
```

### `<NotificationBell />`

Mounted inside the existing nav bar. Uses shadcn's `<DropdownMenu>` for the panel.

```tsx
'use client';
export function NotificationBell({ userId }: { userId: string }) {
  const { notifications, unreadCount } = useNotifications(userId);
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="relative">
        <Bell />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 rounded-full bg-red-500 text-white text-[10px] px-1.5">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-96">
        <div className="flex justify-between p-2">
          <span className="font-medium">Notifications</span>
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="text-xs text-muted">Mark all read</button>
          )}
        </div>
        <div className="max-h-[400px] overflow-auto">
          {notifications.map(n => (
            <NotificationItem
              key={n.id}
              notification={n}
              onClick={() => {
                markRead(n.id);
                router.push(REGISTRY[n.kind].href(n.payload));
              }}
            />
          ))}
          {notifications.length === 0 && (
            <p className="text-center text-sm text-muted py-8">No notifications yet</p>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

`<NotificationItem>` reads from `REGISTRY[n.kind]` to render icon/title/body. Unread items get a subtle primary tint and a small dot.

---

## 5. Mark-as-read mutation

```ts
async function markRead(id: string) {
  await supa.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
}
async function markAllRead(userId: string) {
  await supa.from('notifications').update({ read_at: new Date().toISOString() })
    .eq('user_id', userId).is('read_at', null);
}
```

Realtime catches the UPDATE and refreshes the bell automatically — no need to manually invalidate.

---

## 6. Acceptance checks

- [ ] On login, the bell shows the correct unread count (computed from existing `notifications` rows)
- [ ] When a homeowner sends an SMS to the tenant number → the assigned agent's bell badge increments within 2 seconds
- [ ] Click bell → see last 20 notifications, newest first
- [ ] Click an `sms_received` notification → marks it read AND navigates to the SMS thread
- [ ] Click "Mark all read" → badge goes to 0 within one Realtime tick
- [ ] Notifications for unknown `kind` show a generic icon + "(unknown event)" rather than crash

---

## 7. Notes & gotchas

- **Don't fire notifications inside the webhook for the agent who initiated the action** — a Telefonista who sends an SMS doesn't need a notification that they sent an SMS. Only the recipient/replier triggers a notification, OR the assigned-rufero on prospect events.
- **Mute toggle**: scope creep. Skip for v1; add per-kind mute in M7 settings.
- **Cross-device read sync**: Realtime UPDATE on `read_at` is broadcast to all connected clients of the same user, so reading on one tab clears the badge on others within one tick.
- **Notification cap**: at scale, fetching last 20 per user is cheap; "show all" pagination lands in M7 if anyone asks.
- **Empty state polish**: `bell-off` icon + "Quiet day. We'll let you know if anything happens." beats a blank dropdown.
