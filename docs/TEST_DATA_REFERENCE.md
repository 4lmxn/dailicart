# Test Data Reference

## Database Summary
- **3 Societies** (Prestige, Sobha, Brigade)
- **7 Towers** across societies
- **616 Units** total
- **5 Distributors** with building assignments
- **24 Customers** with addresses
- **15 Active Subscriptions** (milk products)
- **120 Orders** (105 delivered, 15 pending today)

## Test User Credentials

### Admin
- **Phone:** `+919876540000`
- **Name:** Admin User
- **Role:** admin

### Distributors

| Name | Phone | Buildings Assigned | Subscriptions |
|------|-------|-------------------|---------------|
| Ramesh Kumar | `+919876540001` | 3 (Prestige A, B, C) | 6 |
| Suresh Babu | `+919876540002` | 3 (Prestige C + 2 others) | 3 |
| Vijay Singh | `+919876540003` | 1 (Sobha Tower 1) | 3 |
| Kumar Reddy | `+919876540004` | 1 (Sobha Tower 2) | 2 |
| Prakash Rao | `+919876540005` | 1 (Brigade North) | 1 |

### Sample Customers

| Name | Phone | Society | Tower | Unit |
|------|-------|---------|-------|------|
| Rajesh Kumar | `+919876543201` | Prestige | Tower A | 501 |
| Priya Sharma | `+919876543202` | Prestige | Tower A | 802 |
| Amit Patel | `+919876543203` | Prestige | Tower A | 1203 |
| Sneha Reddy | `+919876543204` | Prestige | Tower A | 1404 |
| Vikram Singh | `+919876543211` | Prestige | Tower B | 601 |
| Arun Krishnan | `+919876543231` | Sobha | Tower 1 | 1001 |
| Deepak Jain | `+919876543241` | Sobha | Tower 2 | 901 |
| Sanjay Bhatt | `+919876543251` | Brigade | North Wing | 801 |

## Building Assignments

### Prestige Lakeside Habitat
- **Tower A - Magnolia** (15 floors, 60 units) → Ramesh Kumar
  - 4 customers, 4 subscriptions
- **Tower B - Orchid** (15 floors, 60 units) → Ramesh Kumar
  - 4 customers, 4 subscriptions
- **Tower C - Lily** (12 floors, 48 units) → Suresh Babu
  - 3 customers, 3 subscriptions

### Sobha Dream Acres
- **Tower 1 - Azure** (20 floors, 80 units) → Vijay Singh
  - 4 customers, 4 subscriptions
- **Tower 2 - Sapphire** (18 floors, 72 units) → Kumar Reddy
  - 3 customers, 3 subscriptions

### Brigade Lakefront
- **North Wing** (16 floors, 64 units) → Prakash Rao
  - 2 customers, 2 subscriptions
- **South Wing** (16 floors, 64 units) → **UNASSIGNED** (for testing)

## Product Subscriptions

All subscriptions are for **fast-moving milk products**:
- Nandini Toned Milk (500ml) - ₹25
- Nandini Full Cream Milk (500ml) - ₹28
- Amul Taaza Toned Milk (500ml) - ₹26
- Amul Gold Full Cream Milk (500ml) - ₹30
- Heritage Toned Milk (500ml) - ₹26
- Heritage Full Cream Milk (500ml) - ₹29
- Nandini Curd (200g) - ₹20

## Orders Status

### Today's Orders (15 pending)
- All active subscriptions have pending orders for today
- Status: `pending`
- Payment Status: `pending`

### Historical Orders (105 delivered)
- 7 days of historical delivery data
- Orders delivered at 6:30 AM daily
- Status: `delivered`
- Payment Status: `paid`
- Total Revenue: ₹3,800

## Testing Scenarios

### 1. Admin Dashboard
- **Login as:** Admin (`+919876540000`)
- **Test:** View all distributors, assign buildings, see analytics

### 2. Distributor Flow
- **Login as:** Ramesh Kumar (`+919876540001`)
- **Test:** 
  - View assigned buildings (3 towers)
  - See today's deliveries (6 pending orders)
  - View earnings (commission on 42 delivered orders over 7 days)
  - Mark deliveries as complete

### 3. Building Assignment
- **Login as:** Admin
- **Navigate to:** Distributor Detail → Assignments Tab
- **Test:** 
  - Assign Brigade South Wing to any distributor
  - Remove assignment
  - View subscription counts per building

### 4. Customer Subscriptions
- **Login as:** Rajesh Kumar (`+919876543201`)
- **Test:**
  - View active subscription (Nandini Toned Milk)
  - See today's delivery status
  - Manage wallet balance (₹500)

### 5. Impersonation (Dev Mode)
- Set `EXPO_PUBLIC_DEV_MODE_ROLE=selector` in `.env`
- Open app → Dev Menu → User Picker
- Impersonate any distributor or customer
- Test their screens with real data

## Database Functions Available

### RPCs
- `get_distributor_buildings(p_distributor_id)` - Get assigned buildings
- `get_available_buildings_for_assignment()` - Get unassigned buildings
- `admin_assign_building_to_distributor(p_distributor_id, p_tower_id)` - Assign building
- `admin_remove_building_from_distributor(p_assignment_id)` - Remove assignment
- `compute_distributor_earnings(p_distributor_id)` - Calculate earnings (10% commission)

## Notes

- **Commission Rate:** 10% of order total_amount for delivered orders
- **Delivery Time:** Orders show as delivered at 6:30 AM
- **Wallet:** Auto-deduct enabled for some customers
- **Frequencies:** Daily, Alternate day subscriptions
- **One Unassigned Building:** Brigade South Wing for testing assignments

## Quick Test Command

```bash
# Login as distributor and check earnings
# Phone: +919876540001 (Ramesh Kumar)
# Should see: ~42 deliveries, ₹42-45 earnings (10% commission)
```

## Troubleshooting

If you don't see data:
1. Check impersonation is working (AsyncStorage keys set)
2. Verify network connection to Supabase
3. Check `getAuthUserId()` is being called in screens
4. Look for foreign key constraint errors in queries

---

**Last Updated:** December 5, 2025
**Total Orders Generated:** 120 (7 days of history + today)
**Total Revenue:** ₹3,800
