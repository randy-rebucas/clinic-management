# Inventory Management

Complete guide to managing medicines, supplies, and equipment inventory in MyClinicSoft.

## Overview

The Inventory Management system helps you track and manage:

- Medicines and medications
- Medical supplies
- Equipment
- Stock levels
- Expiration dates
- Reorder points
- Suppliers
- Purchase orders
- Stock adjustments

## Accessing Inventory

Navigate to **Inventory** from the main menu.

**View Options:**
- All items (default)
- Medicines only
- Supplies only
- Equipment only
- Low stock items
- Expiring soon
- Expired items

## Inventory List

### Viewing Inventory

The inventory list displays:
- Item name
- Category
- Current stock level
- Unit of measure
- Reorder level
- Expiration date (earliest)
- Status indicator

**Status Indicators:**
- 🟢 In Stock - Normal levels
- 🟡 Low Stock - Below reorder point
- 🔴 Out of Stock - Zero quantity
- ⚠️ Expiring Soon - Within 30 days
- ❌ Expired - Past expiration date

### Search and Filter

**Search By:**
- Item name
- Generic name
- Brand name
- SKU/Item code
- Supplier

**Filter By:**
- Category (medicines, supplies, equipment)
- Stock status
- Expiration status
- Supplier
- Location

**Sort By:**
- Name (A-Z)
- Stock level (low to high)
- Expiration date (earliest first)
- Last updated

## Adding Inventory Items

### Adding a Medicine

1. Click **Add Item** → **Medicine**
2. Fill in details:

#### Basic Information
- **Generic Name*** (required)
  - Example: Amoxicillin
- **Brand Name**
  - Example: Amoxil
- **Form*** (required)
  - Tablet, Capsule, Syrup, Injection, etc.
- **Strength*** (required)
  - Example: 500mg
- **Item Code/SKU**
  - Internal tracking code

#### Classification
- **Category*** - Medicine
- **Subcategory**
  - Antibiotic
  - Analgesic
  - Antihypertensive
  - Etc.
- **Prescription Required**
  - Yes/No
- **Controlled Substance**
  - Yes/No (if yes, specify schedule)

#### Stock Information
- **Current Stock*** (required)
  - Quantity on hand
- **Unit of Measure***
  - Piece, Box, Bottle, Vial, etc.
- **Reorder Level***
  - Minimum quantity before reorder
- **Optimal Stock Level**
  - Target inventory level
- **Storage Location**
  - Shelf/Cabinet location

#### Supplier Information
- **Primary Supplier**
  - Select from supplier list
- **Supplier Item Code**
  - Supplier's reference number
- **Unit Cost**
  - Cost per unit
- **Selling Price**
  - Price charged to patient

#### Expiration Tracking
- **Track Expiration** - Yes/No
- **Expiration Date**
  - For current batch
- **Alert Days Before Expiry**
  - Default: 30 days

3. Click **Save**

### Adding a Supply

1. Click **Add Item** → **Supply**
2. Fill in similar information:
   - Item name
   - Category (gloves, syringes, gauze, etc.)
   - Quantity
   - Unit of measure
   - Reorder level
   - Supplier
   - Cost and price

### Adding Equipment

1. Click **Add Item** → **Equipment**
2. Fill in:
   - Equipment name
   - Model/Serial number
   - Purchase date
   - Warranty information
   - Maintenance schedule
   - Current status
   - Location

## Managing Stock Levels

### Stock Adjustments

When stock levels change (usage, damage, etc.):

1. Click on inventory item
2. Click **Adjust Stock**
3. Select adjustment type:
   - **Add Stock** - Received new inventory
   - **Remove Stock** - Used or damaged
   - **Set Stock** - Correct count after inventory
   - **Transfer** - Move to different location
4. Enter:
   - Quantity
   - Reason
   - Batch number (if applicable)
   - Expiration date (if applicable)
   - Notes
5. Click **Save Adjustment**

**Adjustment logged:**
- Date and time
- User who made adjustment
- Quantity changed
- Reason
- New stock level

### Receiving Stock

When new inventory arrives:

1. Go to **Purchase Orders** (if PO exists) or
2. Go to inventory item → **Receive Stock**
3. Enter:
   - Quantity received
   - Batch/Lot number
   - Expiration date
   - Supplier invoice number
   - Unit cost (if changed)
   - Received date
4. Click **Receive**

**System Updates:**
- Stock level increases
- Batch tracking added
- Expiration date tracked
- Average cost recalculated

### Dispensing Stock

When medicine/supplies used:

**From Prescription:**
- When marking prescription as dispensed
- System automatically deducts stock
- Links to patient record

**From Invoice:**
- When adding item to invoice
- Stock automatically deducted
- Links to billing

**Manual Dispensing:**
1. Click **Dispense**
2. Enter quantity
3. Add patient reference (optional)
4. Add notes
5. Click **Save**

## Batch and Expiration Management

### Batch Tracking

Track multiple batches of same item:

**Batch Information:**
- Batch/Lot number
- Received date
- Expiration date
- Quantity received
- Quantity remaining
- Supplier

**FIFO (First In, First Out):**
- System automatically dispenses oldest batch first
- Ensures proper rotation
- Reduces waste from expiration

### Expiring Items

View items expiring soon:

1. Click **Expiring Soon** filter
2. See items within alert period
3. For each item:
   - View expiration date
   - Check quantity
   - Options:
     - Use soon
     - Return to supplier
     - Dispose properly
     - Mark as expired

**Expiration Alerts:**
- Dashboard notification
- Email alerts (configurable)
- SMS alerts for critical items
- Weekly expiration report

### Expired Items

Handle expired inventory:

1. Go to **Expired Items** view
2. For each item:
   - Verify expiration
   - Document disposal method
   - Mark as disposed
   - Adjust stock to zero
3. Generate disposal report

**Disposal Documentation:**
- Date of disposal
- Method (returned, destroyed, etc.)
- Quantity disposed
- Authorized by
- Witness (if required)

## Reordering

### Low Stock Alerts

System alerts when stock below reorder level:

**Alert Locations:**
- Dashboard notification
- Inventory page highlighted
- Email notification (daily digest)
- Reports section

**Alert Information:**
- Item name
- Current stock
- Reorder level
- Recommended order quantity

### Creating Purchase Order

1. Click **Create Purchase Order**
2. Select supplier
3. Add items:
   - Search and select items
   - Or add low stock items automatically
   - Specify quantity
   - Confirm pricing
4. Add:
   - PO number
   - Expected delivery date
   - Shipping cost
   - Payment terms
   - Notes
5. Click **Create PO**

**PO Status:**
- Draft
- Sent to Supplier
- Confirmed
- Partially Received
- Received
- Cancelled

### Managing Purchase Orders

View all purchase orders:

**Access:** Inventory → **Purchase Orders**

**Actions:**
- View PO details
- Print PO
- Send to supplier (email)
- Mark as confirmed
- Receive items
- Edit (if draft)
- Cancel

## Suppliers

### Supplier List

Manage supplier information:

**Access:** Inventory → **Suppliers**

**Supplier Information:**
- Company name
- Contact person
- Phone/Email
- Address
- Payment terms
- Delivery time
- Notes

### Adding a Supplier

1. Click **Add Supplier**
2. Fill in:
   - Supplier name
   - Contact information
   - Payment terms
   - Lead time
   - Minimum order
   - Notes
3. Click **Save**

### Supplier Performance

Track supplier metrics:
- On-time delivery rate
- Order accuracy
- Quality issues
- Average cost
- Response time

## Inventory Reports

### Available Reports

Navigate to **Reports** → **Inventory**

**Reports:**
- **Inventory Valuation**
  - Total inventory value
  - By category
  - By location
  
- **Stock Movement**
  - Items added/removed
  - Date range
  - Transaction details
  
- **Expiring Items**
  - Items expiring in X days
  - Value of expiring stock
  - Action needed
  
- **Low Stock Report**
  - Items below reorder level
  - Recommended orders
  - Urgency ranking
  
- **Consumption Report**
  - Usage by date range
  - Top used items
  - Usage patterns
  
- **Dead Stock Report**
  - Items not used in X days
  - Slow-moving inventory
  - Obsolete items
  
- **Supplier Report**
  - Purchases by supplier
  - Supplier performance
  - Payment due

**Export Options:**
- PDF
- Excel
- CSV

### Inventory Analytics

**Metrics:**
- Total items
- Total value
- Stock turnover rate
- Average holding time
- Expiration waste
- Cost of goods sold
- Gross profit margin

**Charts:**
- Stock levels over time
- Consumption trends
- Category breakdown
- Top suppliers
- Expiration timeline

## Physical Inventory Count

Perform periodic inventory counts:

### Conducting Count

1. Go to **Inventory** → **Physical Count**
2. Click **New Count**
3. Select:
   - Count date
   - Items to count (all or by category)
   - Count team members
4. Print count sheets
5. Count physical inventory
6. Enter counted quantities
7. Review discrepancies
8. Adjust stock levels
9. Finalize count

**Discrepancy Handling:**
- System shows expected vs. counted
- Investigate large differences
- Document reasons
- Approve adjustments
- Update stock levels

**Best Practices:**
- Count regularly (monthly or quarterly)
- Two-person verification
- Count by sections
- Use barcode scanner
- Document findings

## Inventory Locations

For clinics with multiple storage areas:

### Location Setup

1. Go to **Settings** → **Inventory** → **Locations**
2. Add locations:
   - Pharmacy
   - Procedure room
   - Emergency kit
   - Storage closet
   - Refrigerator

### Transfer Between Locations

1. Select item
2. Click **Transfer**
3. Select:
   - From location
   - To location
   - Quantity
4. Add reason
5. Click **Transfer**

**Transfer Tracking:**
- Date/time
- User
- Quantity
- Reason
- New balances

## Barcode and Scanning

### Barcode Setup

1. Enable barcodes in settings
2. Print barcode labels:
   - Item name
   - Barcode
   - Batch number
   - Expiration date
3. Attach to items/shelves

### Using Barcodes

**Receiving:**
- Scan items as they arrive
- Auto-populate item details
- Quick entry

**Dispensing:**
- Scan to select item
- Confirm batch and expiry
- Reduce errors

**Counting:**
- Scan during physical count
- Faster and more accurate
- Auto-record

## Automated Reordering

*Advanced feature*

### Auto-Reorder Setup

1. Go to **Settings** → **Inventory** → **Auto-Reorder**
2. Enable auto-reordering
3. Configure:
   - Check frequency (daily)
   - Reorder threshold
   - Suppliers with auto-order
   - Approval required (yes/no)
   - Order method (email/API)

**How It Works:**
- System checks inventory daily
- Identifies items below reorder level
- Calculates optimal order quantity
- Creates draft PO or sends to supplier
- Notifies admin

**Benefits:**
- Never run out of stock
- Reduced manual work
- Consistent ordering
- Better supplier relationships

## Integration with Other Features

### Prescriptions
- Check stock when prescribing
- Alert if medicine not available
- Suggest alternatives
- Auto-deduct when dispensed

### Billing
- Add inventory items to invoices
- Auto-calculate price
- Deduct from stock
- Track sales

### Clinical Visits
- View available supplies
- Record supplies used
- Auto-deduct from inventory

### Reports
- Inventory data in financial reports
- COGS calculation
- Profitability analysis

## Inventory Settings

*Admin only*

Configure in **Settings** → **Inventory**

### General Settings
- Enable/disable inventory module
- Default unit of measure
- Reorder level threshold
- Expiration alert days
- Allow negative stock (yes/no)

### Valuation Method
- FIFO (First In, First Out)
- LIFO (Last In, First Out)
- Average Cost
- Specific Identification

### Permissions
- Who can add items
- Who can adjust stock
- Who can create POs
- Who can approve adjustments

### Notifications
- Low stock alerts
- Expiration alerts
- Reorder reminders
- Daily/weekly reports

## Tips for Effective Inventory Management

1. **Regular Counts** - Perform physical counts regularly
2. **Set Accurate Reorder Levels** - Based on usage patterns
3. **Track Expiration** - Monitor and use FIFO
4. **Supplier Relationships** - Maintain good communication
5. **Document Everything** - Record all adjustments
6. **Review Reports** - Weekly inventory review
7. **Minimize Waste** - Use expiring items first
8. **Standardize** - Use standard units and naming
9. **Security** - Controlled access to storage
10. **Continuous Improvement** - Analyze and optimize

## Troubleshooting

### Stock Count Doesn't Match

**Solutions:**
- Perform physical count
- Check adjustment history
- Review dispense records
- Look for duplicate entries
- Investigate theft/loss

### Item Not Found

**Solutions:**
- Check spelling
- Try generic name
- Search by brand name
- Check archived items
- Add if truly new

### Cannot Dispense - Out of Stock

**Solutions:**
- Check alternative items
- Emergency reorder
- Borrow from another location
- Update patient on delay

## Best Practices

1. **Accurate Data Entry** - Take time to enter correctly
2. **Consistent Naming** - Standardize item names
3. **Regular Updates** - Update costs and prices
4. **Monitor Usage** - Track consumption patterns
5. **Secure Storage** - Prevent unauthorized access
6. **Proper Disposal** - Follow regulations for expired items
7. **Supplier Management** - Multiple suppliers for critical items
8. **Documentation** - Keep all purchase documents
9. **Training** - Train all staff on procedures
10. **Compliance** - Follow regulations for controlled substances

## Controlled Substances

Special handling for controlled medications:

### Requirements
- Separate storage (locked)
- Dual authorization
- Detailed logging
- Regular audits
- Regulatory reporting

### Logging
- Date and time
- Patient name
- Doctor authorization
- Quantity dispensed
- Remaining balance
- Dual signatures

### Audits
- Monthly reconciliation
- Compare records to physical count
- Investigate discrepancies
- Report to authorities
- Maintain audit trail

## Related Documentation

- [Prescriptions](EPRESCRIPTION.md)
- [Billing and Payments](BILLING_PAYMENTS.md)
- [Reports and Analytics](DASHBOARD_REPORTING.md)
- [Settings](SETTINGS_CONFIGURATION.md)
