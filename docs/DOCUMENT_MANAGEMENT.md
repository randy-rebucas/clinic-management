# Document Management

The Documents module stores medical files attached to patients — scan results, referral letters, consent forms, lab printouts, and any other patient-related documents.

---

## Accessing Documents

Go to **Documents** in the sidebar. The list shows all uploaded documents across all patients, with search and filter controls.

### Filtering

| Filter | Description |
|---|---|
| **Search** | Search by patient name or document title |
| **Document Type** | Filter by the category of document |
| **Date range** | Filter by upload date |

---

## Document Types

Documents are categorized for easy retrieval:

| Type | Examples |
|---|---|
| **Lab Result** | External lab printouts, radiology reports |
| **Consent Form** | Signed patient consent documents |
| **Referral Letter** | Letters from or to other providers |
| **Medical Certificate** | Certificates issued to the patient |
| **Prescription** | Physical prescription copies |
| **ID / Insurance** | Patient ID cards, insurance cards |
| **Other** | Any other medical document |

---

## Uploading a Document

### From a Patient Profile (Recommended)

1. Open the **Patient Profile**.
2. Click the **Documents** tab.
3. Click **Upload Document**.
4. Fill in the form and attach the file.

### From the Documents Page

1. Go to **Documents → Upload**.
2. Fill in the document form.

### Upload Form Fields

| Field | Description |
|---|---|
| **Patient** | Required — select the patient this document belongs to |
| **Document Type** | Category of the document |
| **Title** | Descriptive name for the file (e.g., "Chest X-ray — Jan 2025") |
| **Visit** | Link to a clinical visit (optional) |
| **Notes** | Additional context about the document |
| **File** | The file to upload (PDF, JPG, PNG, DOCX supported) |

Click **Upload** to save.

---

## Viewing a Document

1. Open the document from the list or from the patient's Documents tab.
2. The document detail page shows the title, type, linked patient, and associated visit.
3. Click **View** to open the file in the browser, or **Download** to save it locally.

---

## Archiving a Document

Documents cannot be permanently deleted to preserve the medical record. To remove a document from active use:

1. Open the document.
2. Click **Archive**.
3. Confirm.

Archived documents are hidden from the default list but can be found by enabling the **Show Archived** filter.

---

## File Storage

Documents are stored securely using cloud storage (Cloudinary). Uploaded files are:
- Encrypted in transit and at rest.
- Accessible only to authenticated staff with the appropriate permissions.
- Available for streaming or download directly from the document record.

---

## Tips

- Always link documents to a patient and, when applicable, to a visit. This ensures a complete clinical record and makes retrieval easier.
- Use a consistent naming convention for document titles (e.g., "Test Name — Date") to make the list easy to scan.
- The Documents tab on each patient profile shows only that patient's files, making it the fastest way to find records for a specific patient.
