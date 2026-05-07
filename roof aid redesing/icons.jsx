/* global React */
const { useState, useMemo, useEffect } = React;

/* ─── Icons (single source) ─────────────────────────────────────── */
const I = {};
const mk = (path, vb = '0 0 24 24') => (props) => (
  <svg viewBox={vb} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}>{path}</svg>
);
I.dashboard = mk(<><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></>);
I.leads = mk(<><path d="M4 6h16M4 12h16M4 18h10"/></>);
I.newleads = mk(<><path d="M12 4v16M4 12h16"/></>);
I.prospects = mk(<><circle cx="9" cy="9" r="3.5"/><path d="M3 19c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 5l2 2 4-4"/></>);
I.contacted = mk(<><path d="M5 4h14a1 1 0 011 1v11a1 1 0 01-1 1h-9l-5 4V5a1 1 0 011-1z"/></>);
I.followup = mk(<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>);
I.appt = mk(<><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></>);
I.closed = mk(<><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></>);
I.notviable = mk(<><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></>);
I.docs = mk(<><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5"/></>);
I.bell = mk(<><path d="M6 8a6 6 0 1112 0c0 7 3 9 3 9H3s3-2 3-9z"/><path d="M10 21a2 2 0 004 0"/></>);
I.phone = mk(<><path d="M5 4h4l2 5-3 2c1 3 3 5 6 6l2-3 5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"/></>);
I.sms = mk(<><path d="M21 15a2 2 0 01-2 2H8l-5 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></>);
I.mail = mk(<><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 7 9-7"/></>);
I.users = mk(<><circle cx="9" cy="8" r="3.5"/><path d="M3 19c0-3 2.5-5.5 6-5.5s6 2.5 6 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M21 18c0-2.2-1.8-4-4-4"/></>);
I.chart = mk(<><path d="M4 20V8M10 20V4M16 20v-7M22 20H2"/></>);
I.settings = mk(<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3h.1a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8v.1a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></>);
I.search = mk(<><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></>);
I.coords = mk(<><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></>);
I.list = mk(<><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/></>);
I.map = mk(<><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v16M15 6v16"/></>);
I.db = mk(<><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/><path d="M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/></>);
I.signout = mk(<><path d="M15 4h4a2 2 0 012 2v12a2 2 0 01-2 2h-4M10 17l-5-5 5-5M5 12h11"/></>);
I.chevR = mk(<><path d="M9 6l6 6-6 6"/></>);
I.chevD = mk(<><path d="M6 9l6 6 6-6"/></>);
I.x = mk(<><path d="M6 6l12 12M6 18l12-12"/></>);
I.dots = mk(<><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></>);
I.ext = mk(<><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h5"/></>);
I.callsm = mk(<><path d="M5 4h4l2 5-3 2c1 3 3 5 6 6l2-3 5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"/></>);
I.flag = mk(<><path d="M5 21V4M5 4h13l-3 5 3 5H5"/></>);
I.send = mk(<><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></>);
I.assign = mk(<><circle cx="9" cy="8" r="3.5"/><path d="M3 19c0-3 2.5-5.5 6-5.5"/><path d="M16 13l2 2 4-5"/></>);
I.copy = mk(<><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 00-2-2H5a2 2 0 00-2 2v9a2 2 0 002 2h3"/></>);
I.house = mk(<><path d="M3 11l9-7 9 7v9a2 2 0 01-2 2h-4v-7H10v7H6a2 2 0 01-2-2z"/></>);
I.pin = mk(<><path d="M12 22s7-7 7-13a7 7 0 10-14 0c0 6 7 13 7 13z"/><circle cx="12" cy="9" r="2.5"/></>);
I.tag = mk(<><path d="M3 11V4a1 1 0 011-1h7l10 10-8 8z"/><circle cx="8" cy="8" r="1.5"/></>);
I.calendar = I.appt;
I.back = mk(<><path d="M19 12H5M12 19l-7-7 7-7"/></>);
I.edit = mk(<><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 113 3L7 19l-4 1 1-4z"/></>);
I.shield = mk(<><path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/></>);
I.ban = mk(<><circle cx="12" cy="12" r="9"/><path d="M5 5l14 14"/></>);
I.briefcase = mk(<><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2"/></>);
I.shieldcheck = I.shield;
I.clock = mk(<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>);
I.template = mk(<><rect x="4" y="4" width="16" height="6" rx="1"/><rect x="4" y="14" width="7" height="6" rx="1"/><rect x="13" y="14" width="7" height="6" rx="1"/></>);
I.bksp = mk(<><path d="M21 5H9l-6 7 6 7h12a2 2 0 002-2V7a2 2 0 00-2-2z"/><path d="M14 9l4 6M18 9l-4 6"/></>);
I.lock = mk(<><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 118 0v4"/></>);
I.eye = mk(<><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></>);
I.bolt = mk(<><path d="M13 2L3 14h7l-1 8 10-12h-7z"/></>);
I.check = mk(<><path d="M5 12l5 5 9-11"/></>);
I.signal = mk(<><path d="M3 18h2M8 14h2M13 10h2M18 6h2"/><path d="M3 18v3M8 14v7M13 10v11M18 6v15"/></>);

/* Brand mark — original geometric "roof shield" */
const BrandMark = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 11l8-7 8 7v8a1 1 0 01-1 1H5a1 1 0 01-1-1z" fill="currentColor" fillOpacity="0.18"/>
    <path d="M4 11l8-7 8 7"/>
    <path d="M12 4v16"/>
  </svg>
);

window.I = I;
window.BrandMark = BrandMark;
