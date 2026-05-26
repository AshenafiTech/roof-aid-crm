# Roles & Permissions

Roles: `owner`, `admin`, `telefonista`, `rufero`.

### owner
- Full access within own tenant
- Route access: `/admin/*`
- Manage users (create/update users in tenant)
- Assign prospects, edit prospects, any status transition
- Manage tenant phone numbers, document templates, availability blocks

### admin
- Route access: `/admin/*`
- Assign prospects, edit prospects, any status transition
- Cannot manage users (only owner can)
- Manage tenant phone numbers, document templates, appointments
-  Manage users (create/update users in tenant) 

### telefonista
- Edit prospects, create/update appointments
- Status transitions: any except from `not_viable`
- Appointment transitions: `confirmed`, `cancelled`, `rescheduled`
- Cannot assign prospects, cannot manage users, no admin routes

### rufero (field rep)
- Sees only prospects assigned to them and appointments where `rufero_id = auth.uid()`
- Status transitions only from `scheduled` → `closed_customer` or `not_viable`
- Appointment transitions: `completed`, `no_show` (only on own appointments)
- Manage own availability blocks
- Cannot assign prospects, edit arbitrary prospects, manage users, or access admin routes
