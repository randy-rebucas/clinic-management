# Referral Management

The Referrals module manages patient referrals — both outgoing referrals to specialists or other facilities, and incoming referrals from other providers.

---

## Accessing Referrals

Go to **Referrals** in the sidebar. The list shows all referrals with search and filter controls.

### Filtering

| Filter | Description |
|---|---|
| **Search** | Search by patient name or referral code |
| **Status** | Filter by referral status |
| **Date range** | Filter by referral date |

---

## Referral Statuses

| Status | Meaning |
|---|---|
| **Pending** | Referral created; patient not yet seen by the referred provider |
| **Accepted** | Referred provider has accepted the referral |
| **Completed** | Patient has been seen by the referred provider |
| **Cancelled** | Referral was voided |

---

## Creating a Referral

### From a Visit (Recommended)

1. Open the patient's **Visit** record.
2. Click **New Referral** within the visit.
3. The referral is automatically linked to the visit.

### Standalone

1. Go to **Referrals → New Referral**.
2. Search for and select the **Patient**.

---

## Referral Form Fields

| Field | Description |
|---|---|
| **Patient** | Required — the patient being referred |
| **Referring Doctor** | The provider making the referral (defaults to logged-in doctor) |
| **Referred To** | Name of the specialist, doctor, or facility receiving the referral |
| **Specialty / Department** | The specialty or department being referred to (e.g., Cardiology, Neurology) |
| **Referral Reason** | Clinical reason for the referral |
| **Associated Visit** | Link to the visit that prompted the referral |
| **Urgency** | Routine, Urgent, or Emergency |
| **Notes** | Additional clinical information for the receiving provider |
| **Referral Date** | Defaults to today |

Click **Save** to create the referral. A referral code is generated automatically.

---

## Viewing Referral Details

Click any referral in the list to open the detail page. From here you can:
- View all referral information
- Update the status
- Add notes or follow-up information
- Print the referral letter

---

## Printing a Referral Letter

1. Open the referral record.
2. Click **Print Referral**.
3. A formatted referral letter is generated with clinic letterhead, patient details, clinical reason, and doctor signature line.

---

## Updating Referral Status

To track the outcome of a referral:
1. Open the referral.
2. Click the **Status** dropdown.
3. Select the appropriate status (Accepted, Completed, Cancelled).
4. Click **Save**.

---

## Viewing Referral History

From the **Patient Profile**, click the **Referrals** tab to see all referrals for that patient.

---

## Tips

- Always link referrals to a visit so the complete clinical picture is traceable.
- Use the **Notes** field to include relevant clinical history, current medications, and reason for the referral — this information will appear on the printed referral letter.
- Set **Urgency** to **Emergency** for time-sensitive referrals to alert staff to expedite processing.
