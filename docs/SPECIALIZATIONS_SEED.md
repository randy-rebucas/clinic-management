# Medical Specializations

Medical specializations in MyClinicSoft are **globally available** across all tenants. This means all clinics share the same specializations catalog, ensuring consistency and avoiding duplication.

## API Endpoints

### GET /api/specializations
Fetch all active specializations.

**Query Parameters:**
- `category` - Filter by category (optional)
- `search` - Search by name (optional)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "name": "Cardiology",
      "description": "Diagnosis and treatment of heart and cardiovascular conditions",
      "category": "Specialty",
      "active": true
    }
  ],
  "count": 36
}
```

### POST /api/specializations
Create a new specialization (Admin only).

**Request Body:**
```json
{
  "name": "New Specialization",
  "description": "Description here",
  "category": "Specialty",
  "active": true
}
```

### GET /api/specializations/[id]
Fetch a single specialization by ID.

### PUT /api/specializations/[id]
Update a specialization (Admin only).

### DELETE /api/specializations/[id]
Delete a specialization (Admin only). Will fail if doctors are using it.

## Seed Script

```bash
# Seed specializations globally
npm run seed:specializations

# Reset existing specializations before seeding
npm run seed:specializations -- --reset
```

**Note:** The `--tenant` flag is no longer used as specializations are global.

## Specializations Included

The script seeds 36 medical specializations organized into categories:

### Primary Care (4)
- General Practice / Family Medicine
- Internal Medicine
- Pediatrics
- Geriatrics

### Surgery (8)
- Surgery (General)
- Orthopedic Surgery
- Plastic Surgery
- Neurosurgery
- Cardiothoracic Surgery
- Vascular Surgery
- Pediatric Surgery

### Diagnostic (3)
- Radiology
- Pathology
- Anesthesiology

### Emergency (2)
- Emergency Medicine
- Critical Care Medicine

### Specialty (18)
- Cardiology
- Dermatology
- Neurology
- Psychiatry
- Ophthalmology
- ENT (Ear, Nose, and Throat)
- Urology
- Oncology
- Pulmonology
- Gastroenterology
- Endocrinology
- Rheumatology
- Nephrology
- Hematology
- Infectious Disease
- Physical Medicine and Rehabilitation
- Sports Medicine
- Allergy and Immunology

### Other (1)
- Other

## Features

- ✅ **Global Availability**: Shared across all tenants
- ✅ **Idempotent**: Safe to run multiple times
- ✅ **Smart Updates**: Updates existing specializations instead of creating duplicates
- ✅ **Auto-Categorization**: Automatically categorizes specializations
- ✅ **Detailed Descriptions**: Includes helpful descriptions for each specialization
- ✅ **Comprehensive Logging**: Shows detailed progress and results

## Command Line Options

### `--reset`
Deletes all existing specializations before seeding new ones.

```bash
npm run seed:specializations -- --reset
```

## Output Example

```
🏥 Medical Specializations Seed Script

📡 Connecting to MongoDB...
✅ Connected to MongoDB

🏢 Using existing default tenant

🌱 Seeding medical specializations...

   + Created: General Practice / Family Medicine
   + Created: Internal Medicine
   + Created: Pediatrics
 � Specializations are globally available across all tenants
   ✓ Updated: Cardiology
   ~ Skipped: Other (already exists)

============================================================
📊 Summary:
   Created:  30
   Updated:  5
   Skipped:  1
   Total:    36
============================================================

📋 Specializations by Category:

   Primary Care (4):
     • General Practice / Family Medicine
     • Internal Medicine
     • Pediatrics
     • Geriatrics

   Surgery (7):
     • Surgery
     • Orthopedic Surgery
     ...

✅ Specializations seeding completed successfully!

📡 Disconnected from MongoDB
```

## Integration with Main Seed Script

The specializations are also seeded automatically when you run:

```bash
npm run seed
```

This standalone script is useful when you only need to update or reset specializations without running the entire seed process.

## Database Schema

Each specialization is stored with:

```typescript
{
  tenantId: ObjectId,        // Multi-tenant reference
  name: string,              // Specialization name
  description: string,       // Detailed description
  category: string,          /globally with:

```typescript
{
  name: string,              // Specialization name (unique globally)
  description: string,       // Detailed description
  category: string,          // Primary Care, Surgery, Diagnostic, Emergency, Specialty
  active: boolean,           // Whether it's currently available
  createdAt: Date,
  updatedAt: Date
}
```

**Note:** `tenantId` field is optional for backwards compatibility but is no longer used.*Main Seed**: `scripts/seed-data.ts` (includes specializations)

## Troubleshooting

### "MONGODB_URI not found"
Make sure you have a `.env.local` file with your MongoDB connection string:
```env
MONGODB_URI=mongodb://localhost:27017/myclinicsoft
```

### Duplicate key errors
If you see duplicate key errors, use the `--reset` flag to clear existing specializations first.

### Specialization not appearing in UI
1. Verify the specialization was created: Check MongoDB or run with `--reset`
2. Check API endpoint: `/api/specializations`
3. Ensure the tenant ID matches

## Maintenance

To add new specializations:

1. Edit `MEDICAL_SPECIALIZATIONS` array in `scripts/seed-specializations.ts`
2. Add description to `getDescription()` function (optional)
3. Update `categorizeSpecialization()` if needed
4. Run the script: `npm run seed:specializations`
5. Update `components/DoctorsPageClient.tsx` to keep UI in sync

---

**Note**: This script will be automatically run during the initial setup process (`npm run install:setup`).
