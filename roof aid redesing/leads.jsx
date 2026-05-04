/* global React, I, LEADS, STATUS_LABEL, STATUS_TAG, fmtMoney, fmtPhone, initials */
const { useState, useMemo } = React;

function StatusTag({ status, dnc, sm }) {
  return (
    <span className="row-tags" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      <span className={`tag ${STATUS_TAG[status] || 'tag-new'}`}>{STATUS_LABEL[status] || status}</span>
      {dnc && <span className="tag tag-dnc">DNC</span>}
    </span>
  );
}

function RowActions({ onCall, onSMS, onEmail }) {
  return (
    <div className="row-actions">
      <button title="Open" onClick={(e) => e.stopPropagation()}><I.ext/></button>
      <button className="primary" title="Call" onClick={(e) => { e.stopPropagation(); onCall && onCall(); }}><I.callsm/></button>
      <button title="SMS" onClick={(e) => e.stopPropagation()}><I.sms/></button>
      <button title="Email" onClick={(e) => e.stopPropagation()}><I.mail/></button>
      <button title="Schedule" onClick={(e) => e.stopPropagation()}><I.calendar/></button>
      <button title="Send" onClick={(e) => e.stopPropagation()}><I.send/></button>
      <button title="Assign" onClick={(e) => e.stopPropagation()}><I.assign/></button>
      <button title="Flag" onClick={(e) => e.stopPropagation()}><I.flag/></button>
      <button title="More" onClick={(e) => e.stopPropagation()}><I.dots/></button>
    </div>
  );
}

function FilterBar({ view, setView, onQuery, onCoords }) {
  return (
    <div className="leads-bar">
      <div className="field select">
        <span className="field-label">City</span>
        <select><option>All cities</option><option>Colcord</option><option>Watts</option><option>Kansas</option></select>
      </div>
      <div className="field select">
        <span className="field-label">State</span>
        <select><option>All states</option><option>OK</option><option>TX</option></select>
      </div>
      <div className="field select">
        <span className="field-label">Status</span>
        <select><option>All statuses</option><option>New</option><option>Prospect</option><option>Contacted</option></select>
      </div>
      <div className="field select">
        <span className="field-label">Price</span>
        <select><option>All prices</option><option>$0–50k</option><option>$50k–150k</option><option>$150k+</option></select>
      </div>
      <div className="field grow"><I.search/><input placeholder="Search by name…"/></div>
      <div className="field grow"><I.search/><input placeholder="Search by address…"/></div>
      <button className="btn" onClick={onCoords}><I.coords/>Coords</button>
      <div style={{ flexBasis: '100%', height: 0 }}/>
      <div className="seg">
        <button className={view==='list'?'on':''} onClick={() => setView('list')}><I.list/>List</button>
        <button className={view==='map'?'on':''}  onClick={() => setView('map')}><I.map/>Map</button>
      </div>
      <div className="spacer"/>
      <button className="btn" onClick={onQuery}><I.db/>Query Database</button>
    </div>
  );
}

function LeadsList({ leads, expanded, setExpanded, selected, setSelected, onCall, onOpenLead }) {
  const allSelected = selected.length === leads.length;
  const toggle = (id) => setSelected(s => s.includes(id) ? s.filter(x=>x!==id) : [...s, id]);
  const toggleAll = () => setSelected(allSelected ? [] : leads.map(l => l.id));

  return (
    <table className="tbl">
      <thead>
        <tr>
          <th style={{ width: 36 }}><input type="checkbox" className="checkbox" checked={allSelected} onChange={toggleAll}/></th>
          <th style={{ width: 24 }}/>
          <th>Name</th>
          <th>Phone</th>
          <th>Email</th>
          <th>Address</th>
          <th>Status</th>
          <th>Assigned</th>
          <th>Source</th>
          <th>Hail</th>
          <th>Value</th>
          <th style={{ textAlign: 'right' }}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {leads.map(l => (
          <React.Fragment key={l.id}>
            <tr className={expanded === l.id ? 'expanded' : ''} onClick={() => setExpanded(expanded === l.id ? null : l.id)}>
              <td onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" className="checkbox" checked={selected.includes(l.id)} onChange={() => toggle(l.id)}/>
              </td>
              <td>
                <button className={`expander${expanded===l.id?' open':''}`}><I.chevR/></button>
              </td>
              <td className="name">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{l.name}</span>
                  {l.dnc && <span className="tag tag-dnc" style={{ height: 16, fontSize: 9.5 }}>DNC</span>}
                </div>
              </td>
              <td className="mono tnum">{fmtPhone(l.phone)}</td>
              <td className="muted">{l.email || '—'}</td>
              <td>{l.addr}, {l.city}</td>
              <td><StatusTag status={l.status}/></td>
              <td className="muted">Unassigned</td>
              <td className="muted">{l.source}</td>
              <td className="tnum">{l.hail}</td>
              <td className="value">{fmtMoney(l.value)}</td>
              <td className="actions"><RowActions onCall={() => onCall(l)}/></td>
            </tr>
            {expanded === l.id && (
              <tr>
                <td colSpan={12} style={{ padding: 0, height: 'auto', whiteSpace: 'normal' }}>
                  <LeadExpanded lead={l} onCall={() => onCall(l)} onOpen={() => onOpenLead(l)}/>
                </td>
              </tr>
            )}
          </React.Fragment>
        ))}
      </tbody>
    </table>
  );
}

function LeadExpanded({ lead, onCall, onOpen }) {
  return (
    <div className="lead-detail">
      <div className="lead-detail-hd">
        <div style={{ flex: 1, minWidth: 240 }}>
          <h3>{lead.name} <StatusTag status={lead.status} dnc={lead.dnc}/></h3>
          <div className="lead-meta-line">
            <span><I.pin/>{lead.addr}, {lead.city}</span>
            <span><I.users/>Unassigned</span>
            <span><I.calendar/>Added Apr 30, 2026</span>
            <span><I.tag/>{lead.source}</span>
          </div>
        </div>
        <button className="btn ghost sm" onClick={onOpen}><I.ext/>Open full page</button>
      </div>
      <div className="lead-actions-row">
        <button className="btn primary sm" onClick={onCall}><I.callsm/>Call</button>
        <button className="btn sm"><I.sms/>SMS</button>
        <button className="btn sm"><I.mail/>Email</button>
        <button className="btn sm"><I.calendar/>Schedule</button>
        <button className="btn sm"><I.assign/>Assign</button>
        <button className="btn sm"><I.send/>Send</button>
        <button className="btn sm"><I.docs/>Docs</button>
        <button className="btn sm"><I.followup/>Follow Up</button>
        <button className="btn sm"><I.flag/>Flag</button>
        <div className="spacer"/>
        {lead.dnc
          ? <button className="btn danger sm"><I.ban/>Remove DNC</button>
          : <button className="btn sm"><I.ban/>Mark DNC</button>}
      </div>
      <div className="lead-cards">
        <div className="card">
          <div className="card-hd"><div className="ico"><I.phone/></div><h4>Contact</h4></div>
          <div className="card-bd">
            <div className="kv">
              <div><div className="k">Primary phone</div><div className="v mono tnum">{fmtPhone(lead.phone)}</div></div>
              <div><div className="k">Email</div><div className={`v ${lead.email?'':'muted'}`}>{lead.email || '—'}</div></div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-hd"><div className="ico"><I.house/></div><h4>Property</h4></div>
          <div className="card-bd">
            <div className="kv">
              <div><div className="k">Address</div><div className="v">{lead.addr}</div></div>
              <div><div className="k">City / State / Zip</div><div className="v">{lead.city} {lead.zip}</div></div>
              <div><div className="k">Home value</div><div className={`v ${lead.value?'':'muted'}`}>{fmtMoney(lead.value)}</div></div>
              <div><div className="k">Hail size</div><div className="v">{lead.hail}</div></div>
              <div><div className="k">Type</div><div className="v">{lead.type}</div></div>
              <div><div className="k">Source</div><div className="v muted">{lead.source}</div></div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-hd"><div className="ico"><I.shield/></div><h4>Status &amp; assignment</h4></div>
          <div className="card-bd">
            <div className="kv">
              <div>
                <div className="k">Status</div>
                <div className="v"><StatusTag status={lead.status}/></div>
              </div>
              <div><div className="k">Assigned to</div><div className="v muted">Unassigned</div></div>
              <div style={{ gridColumn: '1/-1' }}>
                <div className="k">Tags</div>
                <div className="v"><span className="tag tag-new">storm:2025-05-18</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="lead-map">
        <LeadMap small lead={lead}/>
      </div>
    </div>
  );
}

function LeadMap({ small, lead, leads, activeId, onPin }) {
  const list = leads || [lead].filter(Boolean);
  const positions = [
    [22, 35], [38, 28], [55, 42], [68, 30], [82, 50],
    [15, 60], [30, 55], [48, 70], [62, 65], [78, 78],
    [25, 80], [42, 38], [58, 22], [72, 60], [88, 72],
  ];
  const [layer, setLayer] = useState('map');
  return (
    <div className={`map-shell ${layer === 'satellite' ? 'satellite' : ''}`}>
      <div className="map-roads"/>
      <div className="map-grid"/>
      {!small && (
        <>
          <div className="map-tip"><I.coords/>Right-click the map to search by radius</div>
          <div className="map-controls">
            <button className={layer==='map'?'on':''} onClick={()=>setLayer('map')}>Map</button>
            <button className={layer==='satellite'?'on':''} onClick={()=>setLayer('satellite')}>Satellite</button>
          </div>
        </>
      )}
      {list.map((l, i) => {
        const [x, y] = positions[i % positions.length];
        return (
          <div key={l.id}
               className={`map-pin ${l.dnc?'dnc':''} ${activeId===l.id?'active':''}`}
               style={{ left: `${x}%`, top: `${y}%` }}
               onClick={() => onPin && onPin(l)}>
            <div className="pin"/>
          </div>
        );
      })}
      {!small && activeId != null && (() => {
        const al = list.find(l => l.id === activeId); if (!al) return null;
        const idx = list.indexOf(al); const [x,y] = positions[idx % positions.length];
        return (
          <div className="map-callout" style={{ left: `calc(${x}% + 18px)`, top: `calc(${y}% - 30px)` }}>
            <div className="nm">{al.name}</div>
            <div className="ad">{al.addr}</div>
            <div style={{ marginTop: 4 }}><StatusTag status={al.status}/></div>
          </div>
        );
      })()}
    </div>
  );
}

window.LeadsList = LeadsList;
window.FilterBar = FilterBar;
window.LeadMap = LeadMap;
window.StatusTag = StatusTag;
