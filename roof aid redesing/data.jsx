/* global React, I, BrandMark */
const { useState, useMemo, useEffect } = React;

/* ─── Mock data ─────────────────────────────────────────────── */
const LEADS = [
  { id: 1, name: 'Caleb Smith', phone: '4787174860', email: '', addr: '280 N Moseley Rd', city: 'Colcord, OK', zip: '74338', status: 'new', source: 'hail_damage_list_2025', hail: '1.25"', value: 80000, dnc: false, type: 'residential' },
  { id: 2, name: 'Eddie Spence', phone: '', email: '', addr: '24722 E 570 Rd', city: 'Colcord, OK', zip: '74338', status: 'new', source: 'hail_damage_list_2025', hail: '1.25"', value: 17000, dnc: false, type: 'residential' },
  { id: 3, name: 'Wenford Owens', phone: '', email: '', addr: '707 Sassafras Ln', city: 'Colcord, OK', zip: '74338', status: 'new', source: 'hail_damage_list_2025', hail: '1.25"', value: 13000, dnc: false, type: 'residential' },
  { id: 4, name: 'Dora Sims', phone: '', email: 'wifey0726@yahoo.com', addr: '50158 S 4720 Rd', city: 'Watts, OK', zip: '74964', status: 'new', source: 'hail_damage_list_2025', hail: '1.25"', value: 4000, dnc: false, type: 'residential' },
  { id: 5, name: 'Jack Holloway', phone: '9184225151', email: '', addr: '50638 S 4720 Rd', city: 'Watts, OK', zip: '74964', status: 'new', source: 'hail_damage_list_2025', hail: '1.25"', value: 37000, dnc: true, type: 'residential' },
  { id: 6, name: 'Ashenafi Godana', phone: '+251939279100', email: 'ashenafigodana@gmail.com', addr: '—', city: 'Test seed', zip: '', status: 'new', source: 'test_seed', hail: '—', value: null, dnc: false, type: 'residential' },
  { id: 7, name: 'Paige Fielden', phone: '9182078328', email: '', addr: '11172 County Road 553', city: 'Kansas, OK', zip: '74347', status: 'new', source: 'hail_damage_list_2025', hail: '1.25"', value: 47000, dnc: true, type: 'residential' },
  { id: 8, name: 'Todd Martin', phone: '4794276425', email: '', addr: '19555 E 565 Rd', city: 'Colcord, OK', zip: '74338', status: 'new', source: 'hail_damage_list_2025', hail: '1.25"', value: null, dnc: true, type: 'residential' },
  { id: 9, name: 'Daniel Ward', phone: '9188681870', email: 'howard76@yahoo.com', addr: '1748 Berry Hill Rd', city: 'Kansas, OK', zip: '74347', status: 'new', source: 'hail_damage_list_2025', hail: '1.25"', value: 45000, dnc: false, type: 'residential' },
  { id: 10, name: 'Beth Gildner', phone: '9184224143', email: 'mom2sweetbug@yahoo.c…', addr: '57269 S 680 Rd', city: 'Colcord, OK', zip: '74338', status: 'new', source: 'hail_damage_list_2025', hail: '1.25"', value: 211000, dnc: false, type: 'residential' },
  { id: 11, name: 'John Woods', phone: '9184539699', email: 'jonwoods61@yahoo.com', addr: '4373 Cedar Dr', city: 'Colcord, OK', zip: '74338', status: 'new', source: 'hail_damage_list_2025', hail: '1.25"', value: 136000, dnc: true, type: 'residential' },
  { id: 12, name: 'Charles Goodman', phone: '4794270559', email: '', addr: '57477 Goodman Ln', city: 'Colcord, OK', zip: '74338', status: 'new', source: 'hail_damage_list_2025', hail: '1.25"', value: 304000, dnc: false, type: 'residential' },
  { id: 13, name: 'Olaya Trillo', phone: '', email: '', addr: '56068 S 4744 Rd', city: 'Watts, OK', zip: '74964', status: 'new', source: 'hail_damage_list_2025', hail: '1.25"', value: null, dnc: false, type: 'residential' },
  { id: 14, name: 'Everett Gunter', phone: '', email: '', addr: '17067 US Highway 412', city: 'Kansas, OK', zip: '74347', status: 'new', source: 'hail_damage_list_2025', hail: '1.25"', value: 120000, dnc: false, type: 'residential' },
  { id: 15, name: 'Christine Pilley', phone: '4792384162', email: '', addr: '7556 Cedar Dr', city: 'Colcord, OK', zip: '74338', status: 'new', source: 'hail_damage_list_2025', hail: '1.25"', value: null, dnc: false, type: 'residential', tags: ['storm:2025-05-18'] },
];

const NAV = [
  { group: 'Main', items: [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { id: 'leads', label: 'All Leads', icon: 'leads', badge: '302' },
    { id: 'newleads', label: 'New Leads', icon: 'newleads', badge: '60' },
    { id: 'prospects', label: 'Prospects', icon: 'prospects' },
    { id: 'contacted', label: 'Contacted', icon: 'contacted' },
    { id: 'followup', label: 'Follow Up', icon: 'followup' },
    { id: 'appts', label: 'Appointments', icon: 'appt' },
    { id: 'closed', label: 'Closed Customers', icon: 'closed' },
    { id: 'notviable', label: 'Not Viable', icon: 'notviable' },
    { id: 'documents', label: 'Documents', icon: 'docs' },
    { id: 'notifications', label: 'Notifications', icon: 'bell', badge: '2' },
  ]},
  { group: 'Tools', items: [
    { id: 'phone', label: 'Phone', icon: 'phone' },
    { id: 'sms', label: 'SMS', icon: 'sms' },
    { id: 'email', label: 'Quick Email', icon: 'mail' },
  ]},
  { group: 'Admin', items: [
    { id: 'users', label: 'Users', icon: 'users' },
    { id: 'analytics', label: 'Analytics', icon: 'chart' },
    { id: 'settings', label: 'Settings', icon: 'settings' },
  ]},
];

const STATUS_LABEL = { new: 'New Lead', prospect: 'Prospect', contact: 'Contacted', followup: 'Follow Up', closed: 'Closed', notviable: 'Not Viable' };
const STATUS_TAG   = { new: 'tag-new', prospect: 'tag-prospect', contact: 'tag-contact', followup: 'tag-followup', closed: 'tag-closed', notviable: 'tag-notviable' };

const fmtMoney = (n) => n == null ? '—' : '$' + n.toLocaleString();
const fmtPhone = (p) => {
  if (!p) return '—';
  if (p.startsWith('+')) return p;
  const d = p.replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  return p;
};
const initials = (name) => name.split(' ').filter(Boolean).slice(0,2).map(s=>s[0]).join('').toUpperCase();

window.LEADS = LEADS;
window.NAV = NAV;
window.STATUS_LABEL = STATUS_LABEL;
window.STATUS_TAG = STATUS_TAG;
window.fmtMoney = fmtMoney;
window.fmtPhone = fmtPhone;
window.initials = initials;
