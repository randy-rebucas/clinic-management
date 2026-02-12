# Appointment & Queue Workflow - Visual Diagrams

This document contains all the visual diagrams for the Appointment and Queue Management System workflow.

## Complete Workflow Diagram

```mermaid
graph TD
    Start([Patient Arrival]) --> Choice{Appointment Type?}
    
    %% Scheduled Appointment Path
    Choice -->|Scheduled| SA[Schedule Appointment]
    SA --> SA_Status[Status: Scheduled]
    SA_Status --> SA_Confirm{Confirm?}
    SA_Confirm -->|Yes| SA_Confirmed[Status: Confirmed]
    SA_Confirm -->|No| SA_Cancel[Status: Cancelled]
    SA_Cancel --> End1([End])
    
    %% Walk-In Path
    Choice -->|Walk-In| WI[Add Walk-In Patient]
    WI --> WI_Queue[Auto-assign Queue Number]
    WI_Queue --> WI_Status[Status: Scheduled]
    WI_Status --> WI_Confirm[Status: Confirmed]
    
    %% Move to Queue Action
    SA_Confirmed --> MoveQ{Move to Queue?}
    MoveQ -->|Yes| CreateQ[Create Queue Entry]
    MoveQ -->|No| Wait1[Wait for Appointment Time]
    
    CreateQ --> QueueData[Queue Entry Created:<br/>- Queue Number<br/>- Patient Info<br/>- Doctor/Room<br/>- Priority<br/>- Type: appointment]
    
    WI_Confirm --> QueueManual{Add to Queue System?}
    QueueManual -->|Yes| QueueData
    QueueManual -->|No| Wait2[Patient Waits]
    
    %% Queue Management
    QueueData --> QueueStatus[Queue Status: Waiting]
    QueueStatus --> CheckIn{Patient Check-In?}
    
    CheckIn -->|Manual| ManualCI[Staff Check-In]
    CheckIn -->|QR Code| QRCodeCI[Scan QR Code]
    
    ManualCI --> InQueue[Status: In Queue]
    QRCodeCI --> InQueue
    
    InQueue --> DoctorReady{Doctor Ready?}
    DoctorReady -->|Yes| InProgress[Queue Status: In-Progress]
    DoctorReady -->|No| EstWait[Display Estimated Wait Time]
    EstWait --> DoctorReady
    
    %% Consultation
    InProgress --> Consult[Doctor Consultation]
    Consult --> CompleteQ[Queue Status: Completed]
    
    %% Appointment Completion
    CompleteQ --> UpdateApt[Update Appointment]
    Wait1 --> UpdateApt
    Wait2 --> UpdateApt
    
    UpdateApt --> FinalStatus{Final Status?}
    FinalStatus -->|Completed| Completed[Status: Completed]
    FinalStatus -->|No-Show| NoShow[Status: No-Show]
    FinalStatus -->|Cancelled| Cancelled[Status: Cancelled]
    
    Completed --> End2([End])
    NoShow --> End3([End])
    Cancelled --> End4([End])
    
    %% Styling
    classDef schedClass fill:#3b82f6,stroke:#2563eb,color:#fff
    classDef walkInClass fill:#f97316,stroke:#ea580c,color:#fff
    classDef queueClass fill:#8b5cf6,stroke:#7c3aed,color:#fff
    classDef completeClass fill:#10b981,stroke:#059669,color:#fff
    classDef cancelClass fill:#ef4444,stroke:#dc2626,color:#fff
    
    class SA,SA_Status,SA_Confirm,SA_Confirmed schedClass
    class WI,WI_Queue,WI_Status,WI_Confirm walkInClass
    class CreateQ,QueueData,QueueStatus,CheckIn,InQueue,InProgress,CompleteQ queueClass
    class Completed,CompleteQ completeClass
    class SA_Cancel,NoShow,Cancelled cancelClass
```

## Queue Status State Machine

```mermaid
stateDiagram-v2
    [*] --> waiting: Create Queue Entry
    
    waiting --> waiting: Update Priority
    waiting --> waiting: Assign Doctor/Room
    waiting --> in_progress: Start Consultation
    waiting --> no_show: Patient Left
    waiting --> cancelled: Cancel Entry
    
    in_progress --> in_progress: Pause/Resume
    in_progress --> completed: Finish Consultation
    in_progress --> cancelled: Emergency Cancel
    
    completed --> [*]: Archive & Audit
    no_show --> [*]: Archive & Mark
    cancelled --> [*]: Archive & Reason
    
    note right of waiting
        Patient checked in
        Waiting to be called
        Est. wait time shown
    end note
    
    note right of in_progress
        With doctor
        Timer running
        Room assigned
    end note
    
    note right of completed
        Consultation done
        Duration recorded
        Next actions set
    end note
```

## System Architecture

```mermaid
graph LR
    subgraph "User Interfaces"
        A[Appointments Page]
        B[Queue Management Page]
        C[Patient Display Screen]
        D[Mobile App]
        E[Check-In Kiosk]
    end
    
    subgraph "Queue Management System"
        Q[Queue API]
        QDB[(Queue Database)]
        QS[Queue Service]
        QO[Queue Optimizer]
        QN[Notification Service]
    end
    
    subgraph "Related Systems"
        PT[(Patient Records)]
        DR[(Doctor Schedules)]
        RM[(Room Management)]
        AP[(Appointments)]
        BL[Billing System]
        PR[ePrescription]
        LB[Lab Orders]
    end
    
    subgraph "External Services"
        SMS[SMS Gateway]
        EMAIL[Email Service]
        QR[QR Code Generator]
    end
    
    %% Connections
    A -->|Move to Queue| Q
    B -->|CRUD Operations| Q
    C -->|Display Query| Q
    D -->|Check Status| Q
    E -->|Check-In| Q
    
    Q <-->|Read/Write| QDB
    Q --> QS
    QS --> QO
    QS --> QN
    
    Q <-->|Patient Data| PT
    Q <-->|Doctor Info| DR
    Q <-->|Room Allocation| RM
    Q <-->|Appointment Link| AP
    Q -->|Generate Invoice| BL
    Q -->|Send Rx| PR
    Q -->|Order Tests| LB
    
    QN -->|Send SMS| SMS
    QN -->|Send Email| EMAIL
    Q -->|Generate QR| QR
```

## API Flow Sequence

```mermaid
sequenceDiagram
    participant U as User/Staff
    participant F as Frontend
    participant A as API
    participant D as Database
    participant N as Notification Service
    
    %% Create Queue Entry
    U->>F: Click "Move to Queue"
    F->>A: POST /api/queue
    A->>D: Validate Patient
    D-->>A: Patient Found
    A->>D: Create Queue Entry
    D-->>A: Queue Created (A20260212-001)
    A-->>F: Return Queue Data
    F-->>U: Show Success Message
    A->>N: Send Queue Position SMS
    N-->>U: SMS Notification
    
    %% Check-In
    U->>F: Scan QR Code
    F->>A: POST /api/queue/check-in
    A->>D: Find Queue Entry
    D-->>A: Queue Found
    A->>D: Update checkedIn: true
    D-->>A: Updated
    A-->>F: Check-In Success
    F-->>U: Show Confirmation
    
    %% Start Consultation
    U->>F: Click "Start"
    F->>A: PUT /api/queue/[id]
    A->>D: Update status: in-progress
    D-->>A: Updated
    A-->>F: Status Updated
    F-->>U: Timer Started
    
    %% Complete
    U->>F: Click "Complete"
    F->>A: PUT /api/queue/[id]
    A->>D: Update status: completed
    D-->>A: Consultation Duration: 25 min
    A->>D: Update Appointment
    D-->>A: Appointment Updated
    A-->>F: Completed Successfully
    F-->>U: Show Summary
```

## Data Flow Diagram

```mermaid
graph TB
    subgraph "Input Sources"
        APP[Appointment System]
        WI[Walk-In Registration]
        FU[Follow-Up Scheduling]
    end
    
    subgraph "Queue System Core"
        QE[Queue Entry]
        QN[Queue Number Generator]
        PS[Priority Sorter]
        WT[Wait Time Calculator]
    end
    
    subgraph "Processing"
        CI[Check-In Handler]
        CS[Consultation Tracker]
        CM[Completion Manager]
    end
    
    subgraph "Output Destinations"
        SD[Staff Display]
        PD[Patient Display]
        BG[Billing Generator]
        RP[Reports]
        AL[Audit Logs]
    end
    
    %% Flow
    APP -->|Patient Data| QE
    WI -->|Patient Data| QE
    FU -->|Patient Data| QE
    
    QE --> QN
    QN --> PS
    PS --> WT
    WT --> SD
    WT --> PD
    
    CI --> CS
    CS --> CM
    CM --> BG
    CM --> RP
    CM --> AL
```

## Priority Queue Visualization

```mermaid
graph TD
    subgraph "Queue Order"
        P2A[Priority 2 - Emergency<br/>A20260212-001<br/>Est. Wait: 0 min]
        P2B[Priority 2 - Urgent<br/>W20260212-005<br/>Est. Wait: 15 min]
        P1A[Priority 1 - High<br/>A20260212-002<br/>Est. Wait: 30 min]
        P1B[Priority 1 - High<br/>F20260212-001<br/>Est. Wait: 45 min]
        P0A[Priority 0 - Normal<br/>A20260212-003<br/>Est. Wait: 60 min]
        P0B[Priority 0 - Normal<br/>W20260212-006<br/>Est. Wait: 75 min]
    end
    
    P2A --> P2B
    P2B --> P1A
    P1A --> P1B
    P1B --> P0A
    P0A --> P0B
    
    style P2A fill:#ef4444,color:#fff
    style P2B fill:#ef4444,color:#fff
    style P1A fill:#f59e0b,color:#fff
    style P1B fill:#f59e0b,color:#fff
    style P0A fill:#10b981,color:#fff
    style P0B fill:#10b981,color:#fff
```

## Database Schema Relationships

```mermaid
erDiagram
    QUEUE ||--|| PATIENT : has
    QUEUE ||--o| DOCTOR : assigned_to
    QUEUE ||--o| ROOM : uses
    QUEUE ||--o| APPOINTMENT : linked_from
    QUEUE ||--|| TENANT : belongs_to
    
    QUEUE {
        ObjectId _id PK
        ObjectId tenantId FK
        String queueNumber UK
        String queueType
        ObjectId patient FK
        ObjectId doctor FK
        ObjectId room FK
        ObjectId appointment FK
        String status
        Number priority
        Boolean checkedIn
        Date checkedInAt
        Date startedAt
        Date completedAt
        Number estimatedWaitTime
        Number consultationDuration
    }
    
    PATIENT {
        ObjectId _id PK
        ObjectId tenantId FK
        String firstName
        String lastName
        String phone
        String email
    }
    
    DOCTOR {
        ObjectId _id PK
        ObjectId tenantId FK
        String firstName
        String lastName
        ObjectId specialization FK
    }
    
    APPOINTMENT {
        ObjectId _id PK
        ObjectId tenantId FK
        String appointmentCode
        ObjectId patient FK
        ObjectId doctor FK
        Date appointmentDate
        String appointmentTime
        String status
        Boolean isWalkIn
    }
    
    ROOM {
        ObjectId _id PK
        ObjectId tenantId FK
        String name
        String type
    }
    
    TENANT {
        ObjectId _id PK
        String subdomain
        String name
    }
```

## Timeline View

```
Patient Journey Timeline:
┌─────────────────────────────────────────────────────────────────┐
│ 09:00 AM │ Appointment Scheduled                                │
│          │ Status: scheduled                                    │
├────────────────────────────────────────────────────────────────┤
│ 09:05 AM │ Appointment Confirmed                                │
│          │ Status: confirmed                                    │
├────────────────────────────────────────────────────────────────┤
│ 09:30 AM │ Moved to Queue                                       │
│          │ Queue Number: A20260212-001                          │
│          │ Status: waiting                                      │
├────────────────────────────────────────────────────────────────┤
│ 09:35 AM │ Patient Checked In                                   │
│          │ Method: QR Code                                      │
│          │ Position: #3, Est. Wait: 30 min                     │
├────────────────────────────────────────────────────────────────┤
│ 10:05 AM │ Consultation Started                                 │
│          │ Status: in-progress                                  │
│          │ Room: 101, Doctor: Dr. Smith                        │
├────────────────────────────────────────────────────────────────┤
│ 10:30 AM │ Consultation Completed                               │
│          │ Duration: 25 minutes                                 │
│          │ Status: completed                                    │
├────────────────────────────────────────────────────────────────┤
│ 10:35 AM │ Invoice Generated                                    │
│          │ Next Action: billing                                 │
├────────────────────────────────────────────────────────────────┤
│ 10:40 AM │ Patient Checked Out                                  │
│          │ Total Time in Clinic: 70 minutes                    │
└─────────────────────────────────────────────────────────────────┘
```

## Queue Display Layout

```
┌───────────────────────────────────────────────────────────────┐
│                  CLINIC QUEUE DISPLAY                         │
│                  Date: February 12, 2026                      │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  NOW SERVING:                                                 │
│  ┌─────────────────────────────────────────────┐            │
│  │  🔔  A-005  -  Dr. Smith  -  Room 101      │            │
│  └─────────────────────────────────────────────┘            │
│                                                               │
│  WAITING QUEUE:                                               │
│  ┌─────────────────────────────────────────────┐            │
│  │ 🔴 A-006  Dr. Jones   Est: 15 min  [Urgent]│            │
│  │ 🟡 W-001  Dr. Smith   Est: 30 min  [High]  │            │
│  │ 🟢 A-007  Dr. Lee     Est: 45 min  [Normal]│            │
│  │ 🟢 W-002  Dr. Jones   Est: 60 min  [Normal]│            │
│  │ 🟢 F-003  Dr. Smith   Est: 75 min  [Normal]│            │
│  └─────────────────────────────────────────────┘            │
│                                                               │
│  STATISTICS TODAY:                                            │
│  Patients Served: 42  │  Avg Wait: 22 min  │  In Queue: 5  │
└───────────────────────────────────────────────────────────────┘
```

---

**Document:** Visual Diagrams for Appointment & Queue Workflow  
**Last Updated:** February 12, 2026  
**Version:** 1.0  

For the complete workflow documentation, see [APPOINTMENT_QUEUE_WORKFLOW.md](./APPOINTMENT_QUEUE_WORKFLOW.md)
