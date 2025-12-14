# Patient Journey - Sequence Diagram

## Complete Patient Journey Sequence

```
Patient          Receptionist      Doctor          System           Queue          Billing
  │                  │               │               │                │              │
  │───Register───────►│               │               │                │              │
  │                   │───Create─────►│               │                │              │
  │                   │               │               │───Patient──────►│              │
  │                   │               │               │   Created       │              │
  │                   │◄───Success────│               │                │              │
  │◄───Registered─────│               │               │                │              │
  │                   │               │               │                │              │
  │───Book Appt───────►│               │               │                │              │
  │                   │───Create─────►│               │                │              │
  │                   │               │               │───Appointment──►│              │
  │                   │               │               │   Created       │              │
  │                   │◄───Success────│               │                │              │
  │◄───Confirmed─────│               │               │                │              │
  │                   │               │               │                │              │
  │───Arrive──────────►│               │               │                │              │
  │                   │───Check-in───►│               │                │              │
  │                   │               │               │───Queue─────────►│              │
  │                   │               │               │   Created       │              │
  │                   │◄───Queue #───│               │                │              │
  │◄───Queue #────────│               │               │                │              │
  │                   │               │               │                │              │
  │                   │───Call────────►│               │                │              │
  │                   │               │               │                │              │
  │───Enter Room──────►│               │               │                │              │
  │                   │               │───Start──────►│                │              │
  │                   │               │   Visit       │                │              │
  │                   │               │               │───Visit────────►│              │
  │                   │               │               │   Created       │              │
  │                   │               │               │                │              │
  │                   │               │───Record─────►│                │              │
  │                   │               │   Vitals      │                │              │
  │                   │               │               │                │              │
  │                   │               │───Consult─────│                │              │
  │                   │               │               │                │              │
  │                   │               │───Diagnose───►│                │              │
  │                   │               │               │                │              │
  │                   │               │───Prescribe───►│                │              │
  │                   │               │               │───Prescription─►│              │
  │                   │               │               │   Created       │              │
  │                   │               │               │                │              │
  │                   │               │───Order Lab───►│                │              │
  │                   │               │               │───Lab Order────►│              │
  │                   │               │               │   Created       │              │
  │                   │               │               │                │              │
  │                   │               │───Complete───►│                │              │
  │                   │               │   Visit       │                │              │
  │                   │               │               │───Visit────────►│              │
  │                   │               │               │   Closed        │              │
  │                   │               │               │                │              │
  │◄───Visit Complete─│               │               │                │              │
  │                   │               │               │                │              │
  │                   │───Create──────►│               │                │              │
  │                   │   Invoice     │               │                │              │
  │                   │               │               │───Invoice───────►│              │
  │                   │               │               │   Created       │              │
  │                   │               │               │                │              │
  │◄───Invoice────────│               │               │                │              │
  │                   │               │               │                │              │
  │───Pay─────────────►│               │               │                │              │
  │                   │───Record──────►│               │                │              │
  │                   │   Payment      │               │                │              │
  │                   │               │               │───Payment───────►│              │
  │                   │               │               │   Recorded      │              │
  │                   │◄───Success────│               │                │              │
  │◄───Receipt────────│               │               │                │              │
  │                   │               │               │                │              │
  │                   │               │               │                │              │
```

## Detailed Sequence: Appointment to Payment

### 1. Appointment Booking Sequence

```
Patient          Receptionist      System           Doctor
  │                  │               │               │
  │───Request───────►│               │               │
  │   Appointment    │               │               │
  │                   │───Check──────►│               │
  │                   │   Availability│               │
  │                   │               │───Query──────►│
  │                   │               │   Schedule    │
  │                   │               │◄───Available─│
  │                   │◄───Available──│               │
  │                   │               │               │
  │                   │───Create──────►│               │
  │                   │   Appointment │               │
  │                   │               │───Save───────►│
  │                   │               │   Appointment│
  │                   │               │◄───Success────│
  │                   │◄───Created────│               │
  │◄───Confirmed─────│               │               │
  │                   │               │               │
```

### 2. Visit Consultation Sequence

```
Patient          Nurse            Doctor          System
  │               │                │               │
  │───Check-in────►│                │               │
  │               │───Record───────►│               │
  │               │   Vitals       │               │
  │               │                 │               │
  │               │───Call─────────►│               │
  │               │   Doctor       │               │
  │               │                 │               │
  │───Enter───────►│                 │               │
  │               │                 │───Start───────►│
  │               │                 │   Visit       │
  │               │                 │               │
  │               │                 │───Consult────│
  │               │                 │               │
  │               │                 │───Record──────►│
  │               │                 │   SOAP Notes  │
  │               │                 │               │
  │               │                 │───Prescribe───►│
  │               │                 │               │
  │               │                 │───Order───────►│
  │               │                 │   Lab/Imaging │
  │               │                 │               │
  │               │                 │───Complete───►│
  │               │                 │   Visit       │
  │               │                 │               │
  │◄───Complete────│                 │               │
  │               │                 │               │
```

### 3. Billing and Payment Sequence

```
Patient          Receptionist      System           Billing
  │                  │               │               │
  │                   │───Create──────►│               │
  │                   │   Invoice     │               │
  │                   │               │───Calculate───►│
  │                   │               │   Total       │
  │                   │               │               │
  │                   │               │───Apply───────►│
  │                   │               │   Discounts    │
  │                   │               │               │
  │                   │               │◄───Invoice────│
  │                   │◄───Invoice────│               │
  │◄───Invoice────────│               │               │
  │                   │               │               │
  │───Pay─────────────►│               │               │
  │                   │───Record──────►│               │
  │                   │   Payment      │               │
  │                   │               │───Update──────►│
  │                   │               │   Balance     │
  │                   │               │               │
  │                   │               │───Generate───►│
  │                   │               │   Receipt     │
  │                   │◄───Receipt────│               │
  │◄───Receipt────────│               │               │
  │                   │               │               │
```

## Status Flow Diagram

### Appointment Status Flow
```
┌─────────┐
│ pending │
└────┬────┘
     │
     ▼
┌──────────┐
│scheduled │
└────┬─────┘
     │
     ▼
┌──────────┐      ┌──────────┐
│confirmed │─────►│completed│
└────┬─────┘      └──────────┘
     │
     ├───► cancelled
     └───► no-show
```

### Visit Status Flow
```
┌──────┐
│ open │
└───┬──┘
    │
    ▼
┌────────┐
│ closed │
└────────┘
    │
    └───► cancelled
```

### Invoice Status Flow
```
┌─────────┐
│ unpaid  │
└────┬────┘
     │
     ▼
┌─────────┐
│ partial │
└────┬────┘
     │
     ▼
┌──────┐
│ paid │
└──────┘
```

## Data Flow Diagram

```
┌──────────┐
│ Patient  │
└─────┬────┘
      │
      ├───► Appointment ───► Queue ───► Visit
      │                                    │
      │                                    ├───► Prescription
      │                                    ├───► LabResult
      │                                    ├───► Imaging
      │                                    ├───► Procedure
      │                                    │
      │                                    ▼
      │                                  Invoice
      │                                    │
      │                                    ▼
      └────────────────────────────────── Payment
```

## Key Interactions

1. **Registration**: Patient → Receptionist → System → Patient Record
2. **Booking**: Patient → Receptionist → System → Appointment → Confirmation
3. **Check-in**: Patient → Receptionist → System → Queue → Notification
4. **Consultation**: Patient → Nurse → Doctor → System → Visit Record
5. **Prescription**: Doctor → System → Prescription → Patient
6. **Lab Order**: Doctor → System → Lab Order → Lab → Results → Doctor → Patient
7. **Billing**: System → Invoice → Patient → Payment → Receipt
8. **Follow-up**: Doctor → System → Appointment → Patient

---

*This sequence diagram complements the detailed Patient Journey document*

