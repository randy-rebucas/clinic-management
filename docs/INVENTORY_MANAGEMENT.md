# Inventory Management

The Inventory module tracks clinic supplies, medicines, and equipment. It monitors stock levels, flags low-stock and expiring items, and supports stock adjustments and restocking.

---

## Accessing Inventory

Go to **Inventory** in the sidebar. The list displays all inventory items with their current stock levels and statuses.

### Searching and Filtering

| Filter | Description |
|---|---|
| **Search** | Search by item name |
| **Category** | Filter by Medicine, Supply, Equipment, or Other |
| **Status** | Filter by stock status (In Stock, Low Stock, Out of Stock, Expired) |

---

## Stock Statuses

| Status | Meaning |
|---|---|
| **In Stock** | Quantity is above the reorder level |
| **Low Stock** | Quantity is at or below the reorder level threshold |
| **Out of Stock** | Quantity is zero |
| **Expired** | Item has passed its expiry date |

Items with **Low Stock** or **Out of Stock** status are highlighted to draw attention. Automated alerts can be configured to notify staff (see **Settings → Notifications**).

---

## Adding a New Inventory Item

1. Go to **Inventory → New Item**.
2. Fill in the item form.
3. Click **Save**.

### Item Form Fields

| Field | Description |
|---|---|
| **Item Name** | Required — descriptive name of the item |
| **Category** | Medicine, Supply, Equipment, or Other |
| **Quantity** | Current stock count |
| **Unit** | Unit of measurement (tablets, bottles, boxes, pcs, etc.) |
| **Reorder Level** | The quantity at which the item is flagged as Low Stock |
| **Expiry Date** | For perishable items — triggers Expired status when passed |
| **Notes** | Additional information (storage requirements, supplier, etc.) |

---

## Viewing Item Details

Click any item in the inventory list to open its detail page. The detail page shows:
- Current quantity and status
- Full item information
- Adjustment history (a log of all stock changes)

---

## Adjusting Stock

Use stock adjustments to manually correct the quantity (e.g., after a stock count or to record usage).

1. Open the inventory item.
2. Click **Adjust Stock**.
3. Enter the adjustment:

| Field | Description |
|---|---|
| **Adjustment Type** | Add (increase) or Remove (decrease) |
| **Quantity** | Amount to add or remove |
| **Reason** | Reason for the adjustment (e.g., damaged, used in procedure, stock count correction) |

4. Click **Save**.

The new quantity is calculated and the adjustment is logged with a timestamp.

---

## Restocking an Item

When a delivery arrives:

1. Open the inventory item.
2. Click **Restock**.
3. Enter:

| Field | Description |
|---|---|
| **Quantity Received** | Units received in this delivery |
| **Supplier** | Name of the supplier (optional) |
| **Purchase Price** | Cost per unit (optional, for cost tracking) |
| **Expiry Date** | Update or set the expiry date for the new batch |
| **Notes** | Delivery note or reference number |

4. Click **Save**.

The quantity increases and a restock entry is logged in the adjustment history.

---

## Editing an Item

1. Open the inventory item.
2. Click **Edit**.
3. Update the item details (name, category, reorder level, etc.).
4. Click **Save**.

---

## Inventory Alerts

The system automatically creates notifications when:
- An item quantity falls to or below the **Reorder Level**.
- An item's **Expiry Date** is approaching (configurable warning period in Settings).
- An item is **Out of Stock**.

These alerts appear in the **Notifications** panel and can be sent by email if configured.

---

## Tips

- Set a realistic **Reorder Level** for each item. For high-use supplies, set it high enough to allow time for procurement before running out.
- Check the **Expired** filter regularly to identify items that need to be removed from use.
- Use the **Notes** field to record supplier contact details and product codes to speed up reordering.
