/* global React, I, BrandMark, NAV */
const { useState } = React;

function Sidebar({ route, setRoute, sidebarStyle, setSidebarStyle }) {
  return (
    <aside className="side">
      <div className="side-hd">
        <div className="brand-mark"><BrandMark size={16}/></div>
        <div className="brand-name">Roof-Aid<small>CRM</small></div>
        <button
          className="side-collapse"
          onClick={() => setSidebarStyle(sidebarStyle === 'icons' ? 'full' : 'icons')}
          title="Collapse"
        >
          <I.chevR style={{ width: 13, height: 13, transform: sidebarStyle === 'icons' ? 'rotate(0deg)' : 'rotate(180deg)' }}/>
        </button>
      </div>
      <nav className="nav">
        {NAV.map((g) => (
          <div key={g.group}>
            <div className="nav-group-label">{g.group}</div>
            {g.items.map((it) => {
              const Icon = I[it.icon];
              return (
                <button
                  key={it.id}
                  className={`nav-item${route === it.id ? ' active' : ''}`}
                  onClick={() => setRoute(it.id)}
                  title={it.label}
                >
                  <Icon/>
                  <span>{it.label}</span>
                  {it.badge && <span className="badge">{it.badge}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="side-foot">
        <button className="nav-item" title="Light mode">
          <I.bolt/><span className="label">Light mode</span>
        </button>
      </div>
    </aside>
  );
}

function Topbar({ user, onSignOut, onBellClick, hasUnread }) {
  return (
    <div className="topbar">
      <div className="crumb"><b>Owner</b></div>
      <div className="status-pill"><span className="dot"/> Ready · From (512) 980-6131</div>
      <div className="topbar-right">
        <button className="icon-btn" onClick={onBellClick} title="Notifications">
          <I.bell/>{hasUnread && <span className="ind"/>}
        </button>
        <button className="user-chip">
          <span className="avatar">{user.initials}</span>
          {user.name}
        </button>
        <button className="icon-btn" title="Sign out" onClick={onSignOut}><I.signout/></button>
      </div>
    </div>
  );
}

window.Sidebar = Sidebar;
window.Topbar = Topbar;
