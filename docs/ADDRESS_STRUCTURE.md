# Address Data Structure - Gated Societies

## ✅ **Updated Structure (Clean & Simple)**

For gated communities/societies, the address hierarchy is:

```
Society (Building/Community)
  ↓
Tower/Block (Wing/Phase)
  ↓
Unit (Floor + Flat Number)
```

### Example: Prestige Lakeside Habitat
```
Society: "Prestige Lakeside Habitat"
  Developer: "Prestige Group"
  Area: "Varthur, Bangalore"
  Pincode: "560087"
  
  ↓ Towers:
    - Tower A (15 floors)
    - Tower B (15 floors)
    - Magnolia Block (12 floors)
    
    ↓ Units in Tower A:
      - A-101 (Floor 1)
      - A-102 (Floor 1)
      - A-201 (Floor 2)
      - A-402 (Floor 4)
      ...
```

## 🗂️ **Database Schema**

### `societies`
```sql
- id: UUID
- name: TEXT (e.g., "Prestige Lakeside Habitat")
- developer: TEXT (e.g., "Prestige Group") -- OPTIONAL
- area: TEXT (e.g., "Varthur") -- OPTIONAL
- pincode: TEXT
- is_active: BOOLEAN
```

### `society_towers`
```sql
- id: UUID
- society_id: UUID → societies
- name: TEXT (e.g., "Tower A", "Magnolia")
- floors: INT (e.g., 15)
- is_active: BOOLEAN
```

### `tower_units`
```sql
- id: UUID
- tower_id: UUID → society_towers
- number: TEXT (e.g., "A-402", "1204")
- floor: INT (e.g., 4, 12)
- is_active: BOOLEAN
```

### `addresses` (Customer addresses)
```sql
- id: UUID
- customer_id: UUID → customers
- society_id: UUID → societies
- tower_id: UUID → society_towers
- unit_id: UUID → tower_units
- landmark: TEXT (optional)
- delivery_instructions: TEXT (optional)
- is_default: BOOLEAN
```

## 📱 **Mobile API Usage**

### Fetch Societies
```typescript
import { getSocieties } from '@/services/api/buildings';

const { data: societies } = await getSocieties();
// Returns: [{ id, name, developer, area, pincode }]
```

### Fetch Towers for a Society
```typescript
import { getTowersBySociety } from '@/services/api/buildings';

const { data: towers } = await getTowersBySociety(societyId);
// Returns: [{ id, name, society_id, floors }]
```

### Fetch Units for a Tower
```typescript
import { getUnitsByTower } from '@/services/api/buildings';

const { data: units } = await getUnitsByTower(towerId);
// Returns: [{ id, number, tower_id, floor }]
```

### Save Customer Address
```typescript
import { saveCustomerAddress } from '@/services/api/buildings';

const { data, error } = await saveCustomerAddress({
  customer_id: userId,
  society_id: selectedSociety.id,
  tower_id: selectedTower.id,
  unit_id: selectedUnit.id,
  landmark: 'Near main gate',
  delivery_instructions: 'Ring doorbell twice',
  is_default: true
});
```

## 📊 **Display Address Format**

### Full Address String
```typescript
const address = `${unit.number}, ${tower.name}, ${society.name}, ${society.area}`;
// Example: "A-402, Tower A, Prestige Lakeside Habitat, Varthur"
```

### Short Format
```typescript
const shortAddress = `${unit.number}, ${tower.name}`;
// Example: "A-402, Tower A"
```

### Floor Display
```typescript
const floorDisplay = `Floor ${unit.floor}`;
// Example: "Floor 4"
```

## ✅ **Updated API Files**

All API files have been updated to use this structure:

- ✅ `buildings.ts` - Society/Tower/Unit hierarchy
- ✅ `customers.ts` - Customer list with formatted addresses
- ✅ `admin.ts` - Order assignments with society/tower/unit
- ✅ `distributors.ts` - Distributor assignments by society/tower
- ✅ `types.ts` - Customer interface includes society/tower/unit fields

## 🎯 **Address Display in UI**

### Customer List (Admin)
```typescript
const customer = {
  name: "John Doe",
  address: "A-402, Tower A, Prestige Lakeside Habitat", // formatted
  society: "Prestige Lakeside Habitat",
  tower: "Tower A",
  unit: "A-402",
  floor: "4"
};
```

### Order Details
```typescript
const order = {
  customer_name: "John Doe",
  delivery_address: {
    society: "Prestige Lakeside Habitat",
    tower: "Tower A",
    unit: "A-402",
    floor: 4
  }
};

// Display: "A-402, Floor 4, Tower A"
```

## 🔄 **Migration Notes**

### Old Fields (Removed)
- ❌ `developers` table
- ❌ `projects` table
- ❌ `buildings` table
- ❌ `wings` table
- ❌ `floors` table
- ❌ `flats` table
- ❌ `addresses.building_id`
- ❌ `addresses.wing_id`
- ❌ `addresses.floor_id`
- ❌ `addresses.flat_id`
- ❌ `addresses.street_address`
- ❌ `addresses.area`
- ❌ `addresses.city`
- ❌ `addresses.apartment_number`
- ❌ `addresses.society_name` (text field)

### New Fields (Active)
- ✅ `societies` table
- ✅ `society_towers` table
- ✅ `tower_units` table
- ✅ `addresses.society_id` → societies
- ✅ `addresses.tower_id` → society_towers
- ✅ `addresses.unit_id` → tower_units
- ✅ `customers.address` (JSONB for flexible storage)

## 🚀 **Next Steps for You**

1. **Add Societies**: Insert your gated communities into `societies` table
2. **Add Towers**: For each society, add towers/blocks
3. **Add Units**: For each tower, add all flat numbers with floor numbers
4. **Update Customers**: Assign existing customers to their units

Example SQL:
```sql
-- Add a society
INSERT INTO societies (name, developer, area, pincode) 
VALUES ('Prestige Lakeside Habitat', 'Prestige Group', 'Varthur', '560087');

-- Add towers
INSERT INTO society_towers (society_id, name, floors) 
VALUES 
  ('society-uuid', 'Tower A', 15),
  ('society-uuid', 'Tower B', 15);

-- Add units (bulk)
INSERT INTO tower_units (tower_id, number, floor) 
VALUES 
  ('tower-a-uuid', 'A-101', 1),
  ('tower-a-uuid', 'A-102', 1),
  ('tower-a-uuid', 'A-201', 2),
  -- ... and so on
```
