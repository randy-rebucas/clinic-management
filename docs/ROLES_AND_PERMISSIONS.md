# Roles and Permissions

My Clinic Software uses role-based access control (RBAC). Every user is assigned a role, and each role defines exactly which sections of the system can be accessed and what actions can be performed.

---

## Built-in Roles

### Admin / Owner
Full access to all features, data, and settings across the entire system.

| Area | Permissions |
|---|---|
| All modules | Read, Write, Delete |
| Settings | Full configuration access |
| Users & Roles | Create, edit, delete users and roles |
| Audit Logs | View all system activity |
| Reports | All reports |
| Subscription | Manage billing and subscription |

### Doctor

| Area | Permissions |
|---|---|
| Patients | Read, Write |
| Visits | Read, Write |
| Appointments | Read, Write |
| Prescriptions | Read, Write, **Delete** |
| Lab Results | Read, Write |
| Documents | Read, Write |
| Queue | Read, Write |
| Referrals | Read, Write |
| Reports | Read |
| Medicines | Read |
| Services | Read |
| Rooms | Read |

### Nurse

| Area | Permissions |
|---|---|
| Patients | Read, Write |
| Visits | Read, Write |
| Appointments | Read |
| Prescriptions | Read |
| Lab Results | Read, Write |
| Queue | Read, Write |
| Medicines | Read |
| Rooms | Read |

### Receptionist

| Area | Permissions |
|---|---|
| Patients | Read, Write |
| Appointments | Read, Write |
| Queue | Read, Write |
| Invoices | Read, Write |
| Visits | Read |
| Doctors | Read |
| Services | Read |
| Rooms | Read |

### Accountant

| Area | Permissions |
|---|---|
| Patients | Read |
| Invoices | Read, Write |
| Reports | Read |
| Visits | Read |

### Medical Representative

| Area | Permissions |
|---|---|
| Doctors | Read |
| Appointments | Read |

---

## Permission Levels

| Level | What It Allows |
|---|---|
| **Read** | View records and lists; cannot make changes |
| **Write** | Create new records and edit existing ones |
| **Delete** | Remove records permanently |

---

## Managing Users

> **Admin role required.**

### Creating a User

1. Go to **Users** in the sidebar.
2. Click **New User**.
3. Fill in the form:

| Field | Description |
|---|---|
| **First Name / Last Name** | User's full name |
| **Email** | Login email address — must be unique |
| **Password** | Initial password (user should change this on first login) |
| **Role** | Assign one of the available roles |
| **Active** | Toggle to enable or disable the account |

4. Click **Save**.

The user can now log in with the provided email and password.

### Editing a User

1. Click the user in the Users list.
2. Click **Edit**.
3. Update the fields as needed.
4. Click **Save**.

### Changing a User's Role

1. Open the user record.
2. Click **Edit**.
3. Change the **Role** field.
4. Save.

The new permissions take effect on the user's next login.

### Deactivating a User

Deactivating a user prevents them from logging in without deleting their data.

1. Open the user record.
2. Click **Edit**.
3. Toggle **Active** to off.
4. Save.

---

## Custom Roles

Admins can create custom roles with tailored permission sets.

### Creating a Custom Role

1. Go to **Roles** in the sidebar.
2. Click **New Role**.
3. Enter a **Role Name**.
4. For each module, check the permissions this role should have (Read, Write, Delete).
5. Click **Save**.

The new role is immediately available for assignment to users.

### Editing a Role

1. Click the role in the Roles list.
2. Click **Edit**.
3. Adjust the permissions.
4. Click **Save**.

> Changes to a role affect all users assigned that role immediately.

---

## Audit Logging

Every user action in the system is logged in the **Audit Logs** section, visible to admins. Logs record:
- Which user performed the action
- What action was taken (create, update, delete, view)
- Which record was affected
- The timestamp

Use audit logs for compliance reviews, security investigations, or tracking data changes.

---

## Best Practices

- Assign users the **least privilege** role that covers their responsibilities. For example, a billing clerk should be Accountant, not Admin.
- Regularly review the **Users** list and deactivate accounts for staff who have left the clinic.
- Use **Custom Roles** only when built-in roles genuinely do not fit — custom roles increase administrative complexity.
- Never share login credentials between users. Each staff member should have their own account.
