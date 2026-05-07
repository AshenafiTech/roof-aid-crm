/* global React, ReactDOM, I, BrandMark, LEADS, NAV, Sidebar, Topbar,
   LeadsList, FilterBar, LeadMap, NotificationsPage, SettingsPage, UsersPage,
   PhonePage, LeadDetailPage, CallModal, LoginPage, PlaceholderPage,
   useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakToggle, TweakSelect */
const { useState, useEffect, useMemo } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "dark",
  "accent": "emerald",
  "density": "comfortable",
  "sidebar": "full"
}/*EDITMODE-END*/;

const ACCENT_PRESETS = {
  emerald: { h: 152, name: 'Emerald' },
  blue:    { h: 235, name: 'Cobalt' },
  amber:   { h: 70,  name: 'Amber' },
  violet:  { h: 295, name: 'Violet' },
};

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [route, setRoute] = useState('leads');
  const [view, setView] = useState('list');
  const [expanded, setExpanded] = useState(15); // Christine Pilley expanded
  const [selected, setSelected] = useState([]);
  const [callLead, setCallLead] = useState(null);
  const [openLead, setOpenLead] = useState(null);
  const [loggedIn, setLoggedIn] = useState(true);
  const [activePin, setActivePin] = useState(8);

  // apply theme + accent + density on root
  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute('data-theme', t.theme);
    html.setAttribute('data-density', t.density);
    html.setAttribute('data-sidebar', t.sidebar);
    const accent = ACCENT_PRESETS[t.accent] || ACCENT_PRESETS.emerald;
    html.style.setProperty('--accent-h', String(accent.h));
  }, [t.theme, t.accent, t.density, t.sidebar]);

  if (!loggedIn) {
    return (
      <>
        <LoginPage onSignIn={() => setLoggedIn(true)}/>
        <Tweaks t={t} setTweak={setTweak}/>
      </>
    );
  }

  const user = { name: 'Ashenafi Godana', initials: 'AG' };

  const renderRoute = () => {
    if (openLead) return <LeadDetailPage lead={openLead} onBack={() => setOpenLead(null)} onCall={setCallLead}/>;
    switch (route) {
      case 'leads':
      case 'newleads':
        return (
          <>
            <FilterBar view={view} setView={setView} onQuery={() => {}} onCoords={() => {}}/>
            <div className="leads-meta">
              <span className="count">60 of 302 records</span>
              <div className="spacer"/>
              {selected.length > 0 && <a onClick={() => setSelected([])}>Clear selection ({selected.length})</a>}
            </div>
            {view === 'list' ? (
              <LeadsList
                leads={LEADS}
                expanded={expanded}
                setExpanded={setExpanded}
                selected={selected}
                setSelected={setSelected}
                onCall={setCallLead}
                onOpenLead={setOpenLead}
              />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', height: 'calc(100vh - 56px - 53px - 33px)' }}>
                <div style={{ borderRight: '1px solid var(--line)', overflow: 'auto', background: 'var(--bg)' }}>
                  {LEADS.map(l => (
                    <div key={l.id}
                         onClick={() => setActivePin(l.id)}
                         style={{
                           padding: '12px 16px',
                           borderBottom: '1px solid var(--line-soft)',
                           cursor: 'pointer',
                           background: activePin === l.id ? 'var(--bg-2)' : 'transparent',
                           borderLeft: activePin === l.id ? '2px solid var(--accent)' : '2px solid transparent',
                         }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                        <div style={{ fontWeight: 500, color: 'var(--fg)', display: 'flex', gap: 8, alignItems: 'center' }}>
                          {l.name}
                          {l.dnc && <span className="tag tag-dnc" style={{ height: 16, fontSize: 9.5 }}>DNC</span>}
                        </div>
                        <span className="tag tag-new" style={{ fontSize: 10 }}>New</span>
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--fg-3)' }}>
                        {l.city} {l.value ? `· $${l.value.toLocaleString()}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
                <LeadMap leads={LEADS} activeId={activePin} onPin={(l) => setActivePin(l.id)}/>
              </div>
            )}
          </>
        );
      case 'notifications': return <NotificationsPage/>;
      case 'settings':      return <SettingsPage/>;
      case 'users':         return <UsersPage/>;
      case 'phone':         return <PhonePage/>;
      case 'dashboard':     return <PlaceholderPage title="Dashboard" sub="Pipeline overview, team activity, and storm intake." icon="dashboard"/>;
      case 'prospects':     return <PlaceholderPage title="Prospects" sub="Leads moved into active outreach." icon="prospects"/>;
      case 'contacted':     return <PlaceholderPage title="Contacted" sub="Leads with logged conversations." icon="contacted"/>;
      case 'followup':      return <PlaceholderPage title="Follow Up" sub="Leads waiting on the next touch." icon="followup"/>;
      case 'appts':         return <PlaceholderPage title="Appointments" sub="Scheduled inspections and field visits." icon="appt"/>;
      case 'closed':        return <PlaceholderPage title="Closed Customers" sub="Won deals and signed contracts." icon="closed"/>;
      case 'notviable':     return <PlaceholderPage title="Not Viable" sub="Disqualified, archived, and DNC leads." icon="notviable"/>;
      case 'documents':     return <PlaceholderPage title="Documents" sub="Scopes, contracts, and signed paperwork." icon="docs"/>;
      case 'sms':           return <PlaceholderPage title="SMS" sub="Inbound and outbound SMS conversations." icon="sms"/>;
      case 'email':         return <PlaceholderPage title="Quick Email" sub="Send templated emails to selected leads." icon="mail"/>;
      case 'analytics':     return <PlaceholderPage title="Analytics" sub="Conversion, call volume, and team performance." icon="chart"/>;
      default:              return <PlaceholderPage title={route} sub="Coming soon" icon="dashboard"/>;
    }
  };

  return (
    <>
      <div className="app">
        <Sidebar route={route} setRoute={(r) => { setRoute(r); setOpenLead(null); }} sidebarStyle={t.sidebar} setSidebarStyle={(v) => setTweak('sidebar', v)}/>
        <div className="main">
          <Topbar
            user={user}
            onSignOut={() => setLoggedIn(false)}
            onBellClick={() => { setRoute('notifications'); setOpenLead(null); }}
            hasUnread={true}
          />
          <div className="page">{renderRoute()}</div>
        </div>
      </div>
      {callLead && <CallModal lead={callLead} onClose={() => setCallLead(null)}/>}
      <Tweaks t={t} setTweak={setTweak}/>
    </>
  );
}

function Tweaks({ t, setTweak }) {
  return (
    <TweaksPanel>
      <TweakSection label="Appearance"/>
      <TweakRadio label="Theme" value={t.theme} options={['dark', 'light']} onChange={(v) => setTweak('theme', v)}/>
      <TweakSelect label="Accent" value={t.accent}
                   options={Object.keys(ACCENT_PRESETS).map(k => ({ value: k, label: ACCENT_PRESETS[k].name }))}
                   onChange={(v) => setTweak('accent', v)}/>
      <TweakSection label="Layout"/>
      <TweakRadio label="Density" value={t.density} options={['compact', 'comfortable', 'spacious']} onChange={(v) => setTweak('density', v)}/>
      <TweakRadio label="Sidebar" value={t.sidebar} options={['full', 'icons']} onChange={(v) => setTweak('sidebar', v)}/>
    </TweaksPanel>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
