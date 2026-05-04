/* global React, I, LEADS, fmtPhone, fmtMoney, initials, StatusTag, Map */
const { useState } = React;

/* ─── Notifications ─────────────────────────────────────────────── */
function NotificationsPage() {
  const [tab, setTab] = useState('all');
  const tabs = [
    { id: 'all', label: 'All', count: 12 },
    { id: 'unread', label: 'Unread', count: 3 },
    { id: 'appt', label: 'Appointment Assigned' },
    { id: 'doc', label: 'Document Signed' },
    { id: 'inbound-call', label: 'Inbound Call' },
    { id: 'inbound-sms', label: 'Inbound SMS' },
    { id: 'lead', label: 'Lead Assigned' },
    { id: 'sys', label: 'System Alert' },
  ];
  const items = [
    { id: 1, kind: 'appt', icon: 'appt', unread: true, title: 'Appointment scheduled with Christine Pilley', desc: 'Tuesday May 5 · 10:00 AM · 7556 Cedar Dr, Colcord, OK', time: '12 min ago' },
    { id: 2, kind: 'inbound-call', icon: 'callsm', unread: true, title: 'Missed inbound call from (479) 238-4162', desc: 'Christine Pilley · No voicemail left', time: '1 hr ago' },
    { id: 3, kind: 'lead', icon: 'leads', unread: true, title: '6 new leads imported into All Leads', desc: 'Source: hail_damage_list_2025 · Storm 2026-04-30', time: '4 hrs ago' },
    { id: 4, kind: 'doc', icon: 'docs', title: 'Insurance scope signed by Beth Gildner', desc: '57269 S 680 Rd · 4 pages · Roof replacement', time: 'Yesterday' },
    { id: 5, kind: 'sys', icon: 'shield', title: 'Quiet hours start in 30 minutes', desc: 'Outbound calling will pause at 9:00 PM CST', time: 'Yesterday' },
    { id: 6, kind: 'inbound-sms', icon: 'sms', title: 'SMS reply from Daniel Ward', desc: '"Sounds good, anytime after 4pm works for me"', time: '2 days ago' },
  ];
  const filtered = tab === 'all' ? items : tab === 'unread' ? items.filter(i => i.unread) : items.filter(i => i.kind === tab);
  return (
    <div className="page-inner">
      <h1 className="page-title">Notifications</h1>
      <p className="page-sub">Stay updated on assignments, communications, and system events.</p>
      <div className="notif-tabs">
        {tabs.map(t => (
          <button key={t.id} className={tab===t.id?'on':''} onClick={() => setTab(t.id)}>
            {t.label}{t.count != null && <span className="num">{t.count}</span>}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--fg-3)', marginBottom: 12 }}>{filtered.length} notifications</div>
      {filtered.map(n => {
        const Icon = I[n.icon];
        return (
          <div key={n.id} className={`notif${n.unread ? ' unread' : ''}`}>
            <div className="ico"><Icon/></div>
            <div className="body">
              <div className="title">{n.title}</div>
              <div className="desc">{n.desc}</div>
            </div>
            <div className="time">{n.time}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Settings ─────────────────────────────────────────────────── */
function SettingsPage() {
  const tiles = [
    { icon: 'phone',     name: 'Phone numbers', desc: 'Buy, label, set primary, and configure per-number routing for your business lines.', meta: '1 active' },
    { icon: 'clock',     name: 'Calling hours', desc: 'Set when your team is allowed to call homeowners. Calls outside these hours are blocked.', meta: 'Coming in M7' },
    { icon: 'users',     name: 'Users', desc: 'Add team members, assign roles (owner / admin / telefonista / rufero), set Telnyx extensions.', meta: '8 active' },
    { icon: 'template',  name: 'SMS & email templates', desc: 'Reusable message templates for outbound SMS and email follow-ups.', meta: 'Coming in M7' },
    { icon: 'shield',    name: 'DNC & compliance', desc: 'National DNC list checks, internal suppression list, and quiet-hours policy.', meta: '4 rules' },
    { icon: 'tag',       name: 'Lead sources', desc: 'Manage incoming list sources, mapping rules, and dedupe behavior.', meta: '7 sources' },
  ];
  return (
    <div className="page-inner">
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">Manage how your tenant uses Roof-Aid.</p>
      <div className="settings-grid">
        {tiles.map(t => {
          const Icon = I[t.icon];
          return (
            <div className="setting" key={t.name}>
              <div className="ico"><Icon/></div>
              <div className="body">
                <div className="nm">{t.name}</div>
                <div className="ds">{t.desc}</div>
                <div className="meta" style={{ marginTop: 8 }}>{t.meta}</div>
              </div>
              <div className="arrow"><I.chevR/></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Users ─────────────────────────────────────────────────── */
function UsersPage() {
  const users = [
    { name: 'Ashenafi Godana',   email: 'ashenafigodna@gmail.com', role: 'owner',       phone: '', joined: 'Apr 14, 2026' },
    { name: 'Test Rufero',        email: 'rufero@test.i',          role: 'rufero',      phone: '', joined: 'Apr 16, 2026' },
    { name: 'Jiru Gutema',        email: 'jethier1@gmail.com',     role: 'rufero',      phone: '', joined: 'Apr 16, 2026' },
    { name: 'ashenafi godana',    email: 'alishanil2010@gmail.com',role: 'telefonista', phone: '', joined: 'Apr 16, 2026' },
    { name: 'Ephraim Debel',      email: 'ephraimdebel@gmail.com', role: 'rufero',      phone: '0909090909', joined: 'Apr 16, 2026' },
    { name: 'Telefonista Demo',   email: 'telefonista@gmail.com',  role: 'telefonista', phone: '', joined: 'Apr 18, 2026' },
    { name: 'rufero test',        email: 'rufero@gmail.com',       role: 'rufero',      phone: '', joined: 'Apr 18, 2026' },
    { name: 'Telefonista One',    email: 'telefonista1@roof-aid-test.com', role: 'telefonista', phone: '', joined: 'May 1, 2026' },
  ];
  return (
    <div className="page-inner">
      <h1 className="page-title">User management</h1>
      <p className="page-sub">Invite team members, manage roles, and control access.</p>
      <div className="users-toolbar">
        <div className="stats">
          <span><b>8</b> users</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: 99, background: 'var(--accent)' }}/> 8 active
          </span>
        </div>
        <div className="spacer"/>
        <div className="field"><I.search/><input placeholder="Search users…"/></div>
        <div className="field select"><select><option>All roles</option><option>Owner</option><option>Admin</option><option>Telefonista</option><option>Rufero</option></select></div>
        <button className="btn primary"><I.users/>Invite</button>
      </div>
      <div className="card">
        <table className="tbl">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Phone</th>
              <th>Joined</th>
              <th style={{ textAlign: 'right' }}/>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.email} style={{ cursor: 'default' }}>
                <td className="name">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="avatar" style={{ width: 28, height: 28, fontSize: 11 }}>{initials(u.name)}</span>
                    <div>
                      <div>{u.name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--fg-3)', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
                        <I.mail style={{ width: 11, height: 11 }}/> {u.email}
                      </div>
                    </div>
                  </div>
                </td>
                <td><span className={`role-badge role-${u.role}`}>{u.role}</span></td>
                <td className="mono tnum muted">{u.phone || '—'}</td>
                <td className="muted">{u.joined}</td>
                <td className="actions"><div className="row-actions always"><button><I.dots/></button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="role-legend">
        <span className="l-owner"><b>Owner</b> &nbsp;— Full access including billing and user management</span>
        <span className="l-admin"><b>Admin</b> &nbsp;— Office manager, full prospect access, no billing</span>
        <span className="l-telefonista"><b>Telefonista</b> &nbsp;— Call agent, search, contact, and schedule prospects</span>
        <span className="l-rufero"><b>Rufero</b> &nbsp;— Field inspector, sees only assigned prospects</span>
      </div>
    </div>
  );
}

/* ─── Phone dialer ─────────────────────────────────────────────── */
function PhonePage() {
  const [num, setNum] = useState('');
  const keys = [
    ['1', ''], ['2', 'ABC'], ['3', 'DEF'],
    ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'],
    ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'],
    ['*', ''], ['0', '+'], ['#', ''],
  ];
  const press = (k) => setNum(n => (n + k).slice(0, 18));
  const bksp = () => setNum(n => n.slice(0, -1));

  return (
    <div className="page-inner">
      <h1 className="page-title">Phone</h1>
      <p className="page-sub">Make outbound calls to prospects and leads.</p>
      <div className="dialer-grid">
        <div className="card">
          <div className="card-bd dialer">
            <div className="from">
              <div>
                <div className="lbl">Calling from</div>
                <div className="nm">+1 (512) 980-6131</div>
              </div>
              <span className="status-pill"><span className="dot"/>Ready</span>
            </div>
            <div className={`display ${num ? '' : 'empty'}`}>
              {num ? num : 'Enter number'}
            </div>
            <div className="hint">Tap a digit or type a number · Hold 0 for +</div>
            <div className="keypad">
              {keys.map(([n, l]) => (
                <button key={n} className="key" onClick={() => press(n)}>
                  <span className="n">{n}</span>
                  {l && <span className="l">{l}</span>}
                </button>
              ))}
            </div>
            <div className="dialer-actions">
              <button className="call-btn" disabled={!num}><I.callsm/>Call</button>
              <button className="bksp" onClick={bksp} title="Backspace"><I.bksp/></button>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-hd"><div className="ico"><I.signal/></div><h4>Active call</h4></div>
          <div style={{ padding: 14 }}>
            <div className="active-call">
              <div className="iconwrap"><I.callsm/></div>
              <h3>No call in progress</h3>
              <p>
                Once a call is active, mute / hang-up controls live in the softphone bar at the top of every page.
                Use prospect detail pages for context-aware calls (DNC checks, history, recording).
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Lead detail full page ─────────────────────────────────── */
function LeadDetailPage({ lead, onBack, onCall }) {
  const [tab, setTab] = useState('overview');
  return (
    <div className="page-inner">
      <button className="btn ghost sm" onClick={onBack} style={{ marginBottom: 14 }}><I.back/>Back</button>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 22 }}>
        <div style={{ flex: 1 }}>
          <h1 className="page-title">{lead.name}</h1>
          <p className="page-sub" style={{ marginBottom: 0 }}>{lead.addr}, {lead.city}</p>
        </div>
        <button className="btn" onClick={() => onCall(lead)}><I.callsm/>Call</button>
        <StatusTag status={lead.status} dnc={lead.dnc}/>
      </div>
      <div className="detail-tabs">
        {['overview','pipeline','assignment','activity','notes','sms'].map(t => (
          <button key={t} className={tab===t?'on':''} onClick={() => setTab(t)}>{t[0].toUpperCase()+t.slice(1)}</button>
        ))}
      </div>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-hd" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h4 style={{ fontSize: 14, color: 'var(--fg)', textTransform: 'none', letterSpacing: 0 }}>Overview</h4>
          </div>
          <button className="btn ghost sm"><I.edit/>Edit</button>
        </div>
        <div className="card-bd">
          <div className="kv" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div><div className="k">Name</div><div className="v">{lead.name}</div></div>
            <div><div className="k">Phone</div><div className="v mono tnum">{fmtPhone(lead.phone)}</div></div>
            <div><div className="k">Email</div><div className={`v ${lead.email?'':'muted'}`}>{lead.email || '—'}</div></div>
            <div><div className="k">Address</div><div className="v">{lead.addr}</div></div>
            <div><div className="k">City / State</div><div className="v">{lead.city}</div></div>
            <div><div className="k">ZIP</div><div className="v">{lead.zip || '—'}</div></div>
            <div><div className="k">Hail size</div><div className="v">{lead.hail}</div></div>
            <div><div className="k">Home value</div><div className={`v ${lead.value?'':'muted'}`}>{fmtMoney(lead.value)}</div></div>
            <div><div className="k">Source</div><div className="v">{lead.source}</div></div>
            <div><div className="k">Type</div><div className="v">{lead.type}</div></div>
          </div>
        </div>
      </div>
      <div className="contact-allowed">
        <div className="ico"><I.shieldcheck/></div>
        <div className="body">
          <div className="nm">Contact allowed</div>
          <div style={{ fontSize: 12, color: 'var(--fg-3)', marginBottom: 8 }}>Reason (optional)</div>
          <input placeholder="e.g. Customer requested, National DNC list"/>
        </div>
        <button className="btn danger sm"><I.ban/>Mark Do Not Call</button>
      </div>
    </div>
  );
}

/* ─── Call modal ─────────────────────────────────────────────── */
function CallModal({ lead, onClose }) {
  if (!lead) return null;
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <div className="ico"><I.callsm/></div>
          <div>
            <div className="ttl">Call prospect</div>
            <div className="sub">Place a call to {lead.name}</div>
          </div>
          <button className="x" onClick={onClose}><I.x/></button>
        </div>
        <div className="modal-bd">
          <div className="callee-card">
            <div className="nm">{lead.name}</div>
            <div className="num mono">{fmtPhone(lead.phone) || '—'}</div>
          </div>
          <label>Microphone</label>
          <div className="field">
            <I.signal/>
            <select><option>Default microphone</option><option>External USB mic</option></select>
          </div>
          <label>Calling from</label>
          <div className="field">
            <I.phone/>
            <select><option>+1 (512) 980-6131 — Primary</option></select>
          </div>
        </div>
        <div className="modal-ft">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary"><I.callsm/>Call now</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Login ─────────────────────────────────────────────── */
function LoginPage({ onSignIn }) {
  return (
    <div className="login-page">
      <div className="login-aside">
        <div className="login-aside-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="brand-mark"><BrandMark size={20}/></div>
            <div className="brand-name" style={{ fontSize: 16 }}>Roof-Aid<small>CRM</small></div>
          </div>
          <h1 className="lead">Storm-driven roofing CRM, built for the <em>field</em>.</h1>
          <p className="sub">Track hail-damage leads, dispatch ruferos, and stay in compliance with DNC and quiet-hours rules — all in one workspace.</p>
        </div>
        <div className="login-stats">
          <div className="stat"><div className="v tnum">302</div><div className="l">Active leads</div></div>
          <div className="stat"><div className="v tnum">$4.2M</div><div className="l">Pipeline value</div></div>
          <div className="stat"><div className="v tnum">8</div><div className="l">Team members</div></div>
        </div>
      </div>
      <div className="login-main">
        <form className="login-form" onSubmit={(e) => { e.preventDefault(); onSignIn(); }}>
          <h1>Sign in</h1>
          <p className="sub">Enter your credentials to access your account.</p>
          <div className="group">
            <label>Email</label>
            <input className="input" type="email" placeholder="you@company.com"/>
          </div>
          <div className="group">
            <label>Password</label>
            <input className="input" type="password" placeholder="Enter your password"/>
          </div>
          <button type="submit" className="submit">Sign in</button>
          <div className="foot">Don't have an account? Contact your administrator.</div>
        </form>
      </div>
    </div>
  );
}

/* ─── Generic placeholder for routes we don't fully build out ─── */
function PlaceholderPage({ title, sub, icon }) {
  const Icon = I[icon] || I.dashboard;
  return (
    <div className="page-inner">
      <h1 className="page-title">{title}</h1>
      <p className="page-sub">{sub}</p>
      <div className="card" style={{ padding: '60px 40px', textAlign: 'center' }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: 'var(--bg-3)', color: 'var(--fg-3)',
          display: 'grid', placeItems: 'center', margin: '0 auto 14px'
        }}><Icon style={{ width: 22, height: 22 }}/></div>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{title}</div>
        <div style={{ fontSize: 13, color: 'var(--fg-3)', maxWidth: 320, margin: '0 auto' }}>
          This view follows the same layout language. Toggle to All Leads, Notifications, Settings, Users, or Phone to see the full redesign.
        </div>
      </div>
    </div>
  );
}

window.NotificationsPage = NotificationsPage;
window.SettingsPage = SettingsPage;
window.UsersPage = UsersPage;
window.PhonePage = PhonePage;
window.LeadDetailPage = LeadDetailPage;
window.CallModal = CallModal;
window.LoginPage = LoginPage;
window.PlaceholderPage = PlaceholderPage;
