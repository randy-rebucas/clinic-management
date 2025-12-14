# Doctor Journey - Sequence Diagram

## Complete Doctor Journey Sequence

```
Doctor          System           Patient         Nurse          Admin
  │               │                 │               │              │
  │───Login───────►│                 │               │              │
  │               │◄───Dashboard────│               │              │
  │               │   Data          │               │              │
  │               │                 │               │              │
  │───View───────►│                 │               │              │
  │   Schedule    │                 │               │              │
  │               │◄───Schedule─────│               │              │
  │               │                 │               │              │
  │───View───────►│                 │               │              │
  │   Appointments│                 │               │              │
  │               │◄───Appointments─│               │              │
  │               │                 │               │              │
  │               │                 │───Check-in───►│              │
  │               │                 │               │              │
  │───Start───────►│                 │               │              │
  │   Visit       │                 │               │              │
  │               │───Visit─────────►│              │              │
  │               │   Created       │               │              │
  │               │                 │               │              │
  │               │                 │───Record──────►│              │
  │               │                 │   Vitals      │              │
  │               │                 │               │              │
  │───Review──────►│                 │               │              │
  │   History     │                 │               │              │
  │               │◄───Patient───────│               │              │
  │               │   History       │               │              │
  │               │                 │               │              │
  │───Consult─────│                 │               │              │
  │               │                 │               │              │
  │───Document───►│                 │               │              │
  │   SOAP Notes  │                 │               │              │
  │               │                 │               │              │
  │───Prescribe───►│                 │               │              │
  │               │───Prescription──►│              │              │
  │               │   Created       │               │              │
  │               │                 │               │              │
  │───Order Lab───►│                 │               │              │
  │               │───Lab Order────►│              │              │
  │               │   Created       │               │              │
  │               │                 │               │              │
  │───Order───────►│                 │               │              │
  │   Imaging     │───Imaging───────►│              │              │
  │               │   Created       │               │              │
  │               │                 │               │              │
  │───Sign───────►│                 │               │              │
  │   Visit       │                 │               │              │
  │               │                 │               │              │
  │───Close───────►│                 │               │              │
  │   Visit       │                 │               │              │
  │               │───Visit─────────►│              │              │
  │               │   Closed        │               │              │
  │               │                 │               │              │
  │───View───────►│                 │               │              │
  │   Performance │                 │               │              │
  │               │◄───Metrics──────│               │              │
  │               │                 │               │              │
```

## Detailed Sequence: Daily Consultation Flow

### 1. Morning Routine Sequence

```
Doctor          System           Dashboard
  │               │                 │
  │───Login───────►│                 │
  │               │                 │
  │───Get─────────►│                 │
  │   Dashboard   │                 │
  │               │───Fetch─────────►│
  │               │   Data          │
  │               │                 │
  │               │◄───Today's──────│
  │               │   Appointments  │
  │               │                 │
  │               │◄───Schedule─────│
  │               │                 │
  │               │◄───Stats───────│
  │               │                 │
  │◄───Dashboard──│                 │
  │               │                 │
```

### 2. Visit Consultation Sequence

```
Doctor          System           Patient         Visit
  │               │                 │               │
  │───Start───────►│                 │               │
  │   Visit       │                 │               │
  │               │───Create────────►│              │
  │               │   Visit         │               │
  │               │                 │               │
  │               │◄───Visit────────│               │
  │               │   Created       │               │
  │               │                 │               │
  │───Get─────────►│                 │               │
  │   Patient     │                 │               │
  │   History     │                 │               │
  │               │───Fetch─────────►│              │
  │               │   History       │               │
  │               │                 │               │
  │               │◄───History──────│               │
  │               │                 │               │
  │◄───History────│                 │               │
  │               │                 │               │
  │───Document───►│                 │               │
  │   SOAP Notes  │                 │               │
  │               │───Update────────►│              │
  │               │   Visit         │               │
  │               │                 │               │
  │───Prescribe───►│                 │               │
  │               │───Create────────►│              │
  │               │   Prescription  │               │
  │               │                 │               │
  │───Order───────►│                 │               │
  │   Lab         │───Create────────►│              │
  │               │   Lab Order     │               │
  │               │                 │               │
  │───Sign───────►│                 │               │
  │   Visit       │                 │               │
  │               │───Update────────►│              │
  │               │   Signature     │               │
  │               │                 │               │
  │───Close───────►│                 │               │
  │   Visit       │                 │               │
  │               │───Update────────►│              │
  │               │   Status        │               │
  │               │                 │               │
  │◄───Complete───│                 │               │
  │               │                 │               │
```

### 3. Schedule Management Sequence

```
Doctor          System           Admin
  │               │               │
  │───Get─────────►│               │
  │   Schedule    │               │
  │               │               │
  │◄───Schedule───│               │
  │               │               │
  │───Update──────►│               │
  │   Schedule    │               │
  │               │               │
  │               │───Validate─────►│
  │               │   Conflicts    │
  │               │               │
  │               │◄───Valid───────│
  │               │               │
  │               │───Save────────►│
  │               │   Schedule    │
  │               │               │
  │◄───Updated────│               │
  │               │               │
```

### 4. Performance Tracking Sequence

```
Doctor          System           Analytics
  │               │                 │
  │───Get─────────►│                 │
  │   Productivity│                 │
  │               │───Calculate─────►│
  │               │   Metrics       │
  │               │                 │
  │               │───Fetch─────────►│
  │               │   Appointments  │
  │               │                 │
  │               │───Fetch─────────►│
  │               │   Visits        │
  │               │                 │
  │               │───Fetch─────────►│
  │               │   Prescriptions │
  │               │                 │
  │               │───Fetch─────────►│
  │               │   Revenue      │
  │               │                 │
  │               │◄───Metrics──────│
  │               │                 │
  │               │───Aggregate─────►│
  │               │   Data         │
  │               │                 │
  │               │◄───Report──────│
  │               │                 │
  │◄───Report─────│                 │
  │               │                 │
```

## Status Flow Diagram

### Visit Status Flow
```
┌──────┐
│ open │
└───┬──┘
    │
    ├───► Document SOAP
    ├───► Prescribe
    ├───► Order Tests
    ├───► Sign
    │
    ▼
┌────────┐
│ closed │
└────────┘
```

### Prescription Status Flow
```
┌─────────┐
│ active  │
└────┬────┘
     │
     ▼
┌──────────┐
│ dispensed│
└────┬─────┘
     │
     ▼
┌──────────┐
│completed │
└──────────┘
```

### Lab Result Status Flow
```
┌─────────┐
│ ordered │
└────┬────┘
     │
     ▼
┌────────────┐
│ in-progress│
└────┬───────┘
     │
     ▼
┌──────────┐
│completed │
└────┬─────┘
     │
     ▼
┌──────────┐
│ reviewed │
└──────────┘
```

## Data Flow Diagram

```
Doctor
├── Schedule (Embedded)
├── Appointments (1:N)
│   └── Patient (N:1)
├── Visits (1:N)
│   ├── Patient (N:1)
│   ├── Prescriptions (1:N)
│   ├── LabResults (1:N)
│   ├── Imaging (1:N)
│   ├── Procedures (1:N)
│   └── Referrals (1:N)
└── Performance Metrics (Embedded)
```

## Key Interactions

1. **Login**: Doctor → System → Dashboard
2. **Schedule View**: Doctor → System → Schedule Display
3. **Appointment View**: Doctor → System → Appointment List
4. **Start Visit**: Doctor → System → Visit Created
5. **Review History**: Doctor → System → Patient History
6. **Document**: Doctor → System → SOAP Notes Saved
7. **Prescribe**: Doctor → System → Prescription Created
8. **Order Tests**: Doctor → System → Lab/Imaging Order Created
9. **Sign Visit**: Doctor → System → Digital Signature Recorded
10. **Close Visit**: Doctor → System → Visit Closed
11. **View Performance**: Doctor → System → Productivity Report

---

*This sequence diagram complements the detailed Doctor Journey document*

