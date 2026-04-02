# Laboratory Results

The Lab Results module manages laboratory test orders, tracks specimen processing, and stores test results for each patient.

---

## Accessing Lab Results

Go to **Lab Results** in the sidebar. The list shows all lab orders and results, with search and filter controls.

### Filtering

| Filter | Description |
|---|---|
| **Search** | Search by patient name or result code |
| **Status** | Filter by processing status |
| **Date range** | Filter by request date |

---

## Lab Result Statuses

| Status | Meaning |
|---|---|
| **Ordered** | Test has been requested; specimen not yet collected |
| **Collected** | Specimen has been taken |
| **Processing** | Sample is being analyzed |
| **Completed** | Results are available |
| **Cancelled** | Order was voided |

---

## Creating a Lab Order

### From a Visit (Recommended)

1. Open the patient's **Visit** record.
2. Click **New Lab Order** within the visit.
3. The order is automatically linked to the visit.

### Standalone

1. Go to **Lab Results** in the sidebar.
2. Click **New Lab Order**.
3. Search for and select the **Patient**.

---

## Lab Order Form

| Field | Description |
|---|---|
| **Patient** | Required — the patient to be tested |
| **Requested By** | The ordering provider (defaults to logged-in doctor) |
| **Test Type** | The type of test or panel being ordered |
| **Priority** | Routine, Urgent, or STAT |
| **Associated Visit** | Link to a visit (optional) |
| **Notes** | Clinical context or special instructions for the lab |
| **Request Date** | Defaults to today |

Click **Submit Order** to save.

---

## Recording Results

When results return from the laboratory:

1. Open the lab order from the **Lab Results** list.
2. Click **Enter Results** or **Upload Results**.
3. Enter the values for each test in the order, or upload the result document.
4. Update the **Status** to **Completed**.
5. Click **Save**.

### Uploading a Result Document

1. Open the lab order.
2. Click **Upload File**.
3. Select the PDF or image file of the result.
4. Click **Upload**.

The uploaded file is attached to the lab record and visible in the patient's profile.

---

## Notifying the Patient

After results are entered:

1. Open the completed lab result.
2. Click **Notify Patient**.
3. A notification is sent via the configured channel (in-app, email, or SMS).

> Notification channels depend on your clinic's **Settings → Notifications** configuration.

---

## Third-Party Lab Integration

If your clinic uses an external laboratory system, results can be received automatically via webhook. Contact your administrator or the system provider to configure this integration.

---

## Viewing Lab History

From the **Patient Profile**, click the **Lab Results** tab to see all orders and results for that patient in chronological order.

---

## Tips

- Setting **Priority** to **STAT** or **Urgent** flags the order for immediate attention in the lab.
- Use the **Notes** field to provide clinical context (e.g., "rule out dengue — patient has 3-day fever").
- Results uploaded as files are stored securely and are accessible only to authorized staff.
- Always link lab orders to a visit so they appear in the complete clinical record.
