# Society Unit Management & Customer Assignment

## Overview
This document explains how the system prevents duplicate unit assignments and ensures data integrity for society/tower/unit mappings.

## Features Implemented

### 1. **Unit-Level Customer Details (Admin)**
- **Location**: Admin Dashboard → Societies Tab → Select Society → Expand Tower → Tap on any Unit
- **Functionality**: 
  - Shows full customer information if unit is assigned:
    - Customer name, phone, email
    - Wallet balance
    - Active subscriptions count
    - Default address status
    - Unit details (number, floor, status)
  - Shows "Unit Not Assigned" message if unit is vacant
- **Use Case**: Admins can quickly verify who lives in which unit and their account status

### 2. **Duplicate Unit Prevention (Multi-Layer)**

#### Layer 1: Application-Level Validation
**Service**: `mobile/src/services/address.ts`
- `createAddress()` and `updateAddress()` functions check if a unit_id is already assigned to another customer
- Throws user-friendly error: `"This unit is already assigned to another customer. Please select a different unit or contact support."`

#### Layer 2: Database-Level Constraint
**Migration**: `supabase/migrations/add_unique_unit_constraint.sql`
- Creates unique partial index: `idx_addresses_unique_unit`
- Prevents duplicate unit assignments at database level
- Only enforced when `unit_id IS NOT NULL` (allows null values)

#### Layer 3: User-Facing Error Messages
**ProfileScreen**: `mobile/src/screens/customer/ProfileScreen.tsx`
- Catches errors from address service
- Displays clear Alert with error message to customer
- Prevents form submission until valid unit is selected

## How It Works

### Scenario 1: Customer Onboarding
1. Customer selects Society → Tower → Unit during address setup
2. System checks if unit is already assigned
3. If **available**: Address is created with unit mapping
4. If **taken**: Shows error "This unit is already assigned to another customer"

### Scenario 2: Customer Updates Address
1. Customer tries to change their unit in Profile screen
2. System validates new unit is not assigned to someone else
3. If **available**: Updates address with new unit_id
4. If **taken**: Shows error and keeps existing address

### Scenario 3: Admin Verification
1. Admin navigates to Society Detail screen
2. Expands tower to see all units
3. Taps on any unit to see:
   - Customer details (if assigned)
   - "Unit Not Assigned" message (if vacant)

## Database Schema

### addresses table
```sql
CREATE TABLE addresses (
  id UUID PRIMARY KEY,
  customer_id UUID REFERENCES customers(id),
  society_id UUID REFERENCES societies(id),
  tower_id UUID REFERENCES society_towers(id),
  unit_id UUID REFERENCES tower_units(id),  -- Only ONE address can have this unit_id
  apartment_number TEXT,
  street_address TEXT,
  area TEXT,
  city TEXT,
  pincode TEXT,
  landmark TEXT,
  delivery_instructions TEXT,
  is_default BOOLEAN DEFAULT false
);

-- Unique constraint: one unit = one address
CREATE UNIQUE INDEX idx_addresses_unique_unit 
ON addresses(unit_id) 
WHERE unit_id IS NOT NULL;
```

## Error Handling Flow

```
Customer selects Unit A-501
  ↓
address.ts → createAddress()
  ↓
Check: Is unit_id already in addresses table?
  ↓
YES → throw Error("This unit is already assigned...")
  ↓
ProfileScreen catches error
  ↓
Alert.alert('Error', error.message)
  ↓
Customer sees clear message
  ↓
Customer must select different unit
```

## Admin Actions

### To View Unit Assignments:
1. Open Admin Dashboard
2. Tap "Societies" tab
3. Tap on any society (e.g., "Prestige Lakeside Habitat")
4. Expand a tower (e.g., "Tower A")
5. Tap on any unit to view customer details

### To Identify Vacant Units:
- Units without customer names show empty in the collapsed view
- Tapping them shows "Unit Not Assigned" modal

### To Handle Conflicts:
If a customer claims they can't select their unit:
1. Check if unit is already assigned to someone else
2. Verify the existing customer is legitimate
3. If duplicate/error, delete the incorrect address entry in Supabase dashboard
4. Customer can then re-select the unit

## Testing Checklist

- [ ] Run migration: `add_unique_unit_constraint.sql` in Supabase
- [ ] Try to assign same unit to two different customers → Should fail with error
- [ ] Tap on assigned unit in admin panel → Should show customer details
- [ ] Tap on vacant unit → Should show "Unit Not Assigned"
- [ ] Customer with existing unit tries to change to occupied unit → Should show error
- [ ] Customer with existing unit changes to vacant unit → Should succeed

## Files Changed

1. `/mobile/src/screens/admin/SocietyDetailScreen.tsx`
   - Added unit tap handler and customer detail modal
   - Shows comprehensive customer information or empty state

2. `/mobile/src/services/address.ts`
   - Added duplicate validation in `createAddress()` and `updateAddress()`
   - Checks for existing unit assignments before allowing changes

3. `/mobile/src/screens/customer/ProfileScreen.tsx`
   - Already has proper error handling for address operations
   - Displays service-level errors to user

4. `/supabase/migrations/add_unique_unit_constraint.sql`
   - Database-level constraint for unit uniqueness
   - Must be run before using the feature

## Benefits

✅ **Data Integrity**: One unit = one customer at database level  
✅ **User Experience**: Clear error messages guide customers to correct selection  
✅ **Admin Visibility**: Full customer details at unit level  
✅ **Conflict Prevention**: Multi-layer validation prevents accidental duplicates  
✅ **Easy Debugging**: Admin can quickly identify which customer is in which unit
