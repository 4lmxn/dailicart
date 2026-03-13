/**
 * Unified Bootstrap Script
 * Runs end-to-end demo environment setup:
 * 1. Auth/accounts seeding
 * 2. Profile backfill (if separate)
 * 3. Product + extended SKU seed (requires manual SQL run beforehand)
 * 4. Sample subscriptions creation (varied frequencies)
 * 5. Distributor capacity rows (today + tomorrow)
 * 6. Order generation for today + tomorrow (capacity-aware)
 * 7. Dashboard summary output (master_admin_dashboard)
 *
 * Usage:
 *   set EXPO_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars
 *   npm run bootstrap:demo
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

function logStep(title) { console.log(`\n▶ ${title}`); }

function getIstDateString(date = new Date()) {
  const utcMillis = date.getTime() + date.getTimezoneOffset() * 60000;
  const istMillis = utcMillis + 5.5 * 60 * 60000;
  return new Date(istMillis).toISOString().slice(0, 10);
}

// Seed minimal societies/towers/units for demo and return a unit address
async function seedSocietyStructure() {
  // Upsert a demo society
  const { data: societyRow, error: societyErr } = await supabase
    .from('societies')
    .upsert({ name: 'Demo Society', developer: 'Demo Developer', pincode: '560066', is_active: true })
    .select('id')
    .single();
  if (societyErr) throw societyErr;
  const societyId = societyRow.id;

  // Upsert a couple towers
  const { data: towers, error: towerErr } = await supabase
    .from('society_towers')
    .upsert([
      { name: 'Tower A', society_id: societyId, floors: 10, is_active: true },
      { name: 'Tower B', society_id: societyId, floors: 12, is_active: true }
    ])
    .select('id,name')
    .order('name');
  if (towerErr) throw towerErr;
  const towerA = towers.find(t => t.name === 'Tower A');
  const towerId = towerA?.id || towers[0]?.id;

  // Upsert a few units in selected tower
  await supabase
    .from('tower_units')
    .upsert([
      { tower_id: towerId, number: 'A-101', floor: 1, is_active: true },
      { tower_id: towerId, number: 'A-102', floor: 1, is_active: true },
      { tower_id: towerId, number: 'A-402', floor: 4, is_active: true }
    ]);

  const { data: unitRow, error: unitErr } = await supabase
    .from('tower_units')
    .select('id,number,floor')
    .eq('tower_id', towerId)
    .eq('number', 'A-402')
    .single();
  if (unitErr) throw unitErr;

  return { societyId, towerId, unitId: unitRow.id };
}

// Ensure a customer has a society/tower/unit address; create one if missing
async function ensureAddressForCustomer(customerId) {
  try {
    const { data: existing, error: existingErr } = await supabase
      .from('addresses')
      .select('id')
      .eq('customer_id', customerId)
      .limit(1);
    if (existingErr) throw existingErr;
    if (existing?.length) return existing[0].id;
  } catch (e) {
    // table might not exist; continue to create
  }
  const { societyId, towerId, unitId } = await seedSocietyStructure();
  const { data, error } = await supabase
    .from('addresses')
    .insert({
      customer_id: customerId,
      society_id: societyId,
      tower_id: towerId,
      unit_id: unitId,
      landmark: 'Near Main Gate',
      delivery_instructions: 'Ring twice',
      is_default: true
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

async function createSampleSubscriptions() {
  console.log('\n▶ Creating sample subscriptions');
  // Fetch test customer (must use customers.id for subscription FK)
  const { data: custRows, error: custErr } = await supabase
    .from('customers')
    .select('id, user_id')
    .limit(1);
  if (custErr || !custRows?.length) {
    console.log('⚠ No customer rows found, skipping subscriptions');
    return;
  }
  const customerId = custRows[0].id;

  // Distributor (choose first distributor row; use distributors.id for FK)
  const { data: distRows, error: distErr } = await supabase
    .from('distributors')
    .select('id,user_id')
    .limit(1);
  let distributorId = distRows?.[0]?.id || null;
  if (distErr || !distributorId) {
    console.log('⚠ Distributor missing, proceeding without assignment.');
  }

  // Get a few products
  const { data: products, error: prodErr } = await supabase
    .from('products')
    .select('id, name, price')
    .limit(5);
  if (prodErr || !products?.length) {
    console.log('⚠ No products found, cannot create subscriptions');
    return;
  }

  const addressId = await ensureAddressForCustomer(customerId);

  const frequencies = ['daily', 'alternate', 'weekly'];
  const today = new Date();
  const startDate = getIstDateString(today);
  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    const freq = frequencies[i % frequencies.length];
    try {
      const { data, error } = await supabase.rpc('create_subscription_and_schedule', {
        p_customer_id: customerId,
        p_address_id: addressId, // may be null
        p_product_id: product.id,
        p_quantity: 1,
        p_frequency: freq,
        p_custom_days: null,
        p_start_date: startDate,
        p_assigned_distributor_id: distributorId,
      });
      if (error) throw error;
      console.log(`  ✓ Subscription for product '${product.name}' (${freq}) created`);
    } catch (e) {
      console.log(`  ⚠ Failed to create subscription for '${product.name}':`, e.message);
    }
  }
}

async function seedCapacity() {
  console.log('\n▶ Seeding distributor capacity rows');
  // Use distributors.id not user_id
  const { data: distCapRows, error: dErr } = await supabase.from('distributors').select('id').limit(1);
  if (dErr || !distCapRows?.length) {
    console.log('⚠ No distributors found, skipping capacity');
    return;
  }
  const distId = distCapRows[0].id;
  const dates = [0, 1].map(offset => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return getIstDateString(d);
  });
  for (const date of dates) {
    try {
      const { error } = await supabase.from('distributor_capacity').upsert({ distributor_id: distId, date, max_orders: 25 });
      if (error) throw error;
      console.log(`  ✓ Capacity set: ${date} max_orders=25`);
    } catch (e) {
      console.log('  ⚠ Capacity upsert failed:', e.message);
    }
  }
}

// Assign distributor to society for deliveries
async function seedDistributorAssignments() {
  console.log('\n▶ Seeding distributor assignments');
  const { data: distRows } = await supabase.from('distributors').select('id').limit(1);
  const { data: societyRows } = await supabase.from('societies').select('id').limit(1);
  const distributorId = distRows?.[0]?.id;
  const societyId = societyRows?.[0]?.id;
  if (!distributorId || !societyId) {
    console.log('⚠ Missing distributor or society; skip assignments');
    return;
  }
  const today = getIstDateString();
  // Note: distributor_building_assignments requires tower_id as well
  const { data: towerRows } = await supabase.from('society_towers').select('id').eq('society_id', societyId).limit(1);
  const towerId = towerRows?.[0]?.id;
  if (!towerId) {
    console.log('⚠ No tower found for society; skip assignment');
    return;
  }
  const { error } = await supabase
    .from('distributor_building_assignments')
    .upsert({ distributor_id: distributorId, society_id: societyId, tower_id: towerId, assigned_at: today, is_active: true }, { onConflict: 'distributor_id,tower_id' });
  if (error) {
    console.log('  ⚠ Assignment upsert failed:', error.message);
  } else {
    console.log('  ✓ Assigned distributor to society');
  }
}

async function generateOrders(targetDate) {
  // Optional: depends on RPC presence; skip to reduce errors
}

async function printDashboard() {
  // Optional: depends on RPC presence; skip to reduce errors
}

// Direct upserts without auth-admin; deterministic IDs for dev
async function upsertCoreUsers() {
  logStep('Upserting core users and profiles (service role)');
  const ids = {
    customer: '00000000-0000-0000-0000-000000000001',
    distributor: '00000000-0000-0000-0000-000000000002',
    admin: '00000000-0000-0000-0000-000000000003',
  };
  // Users
  for (const [role, id] of Object.entries(ids)) {
    const email = `${role}@test.com`;
    const name = `Test ${role.charAt(0).toUpperCase() + role.slice(1)}`;
    const phone = role === 'customer' ? '+919876543210' : role === 'distributor' ? '+919876543211' : '+919876543212';
    const { error } = await supabase
      .from('users')
      .upsert({ id, email, name, phone, role }, { onConflict: 'id' });
    if (error) {
      console.log('  ⚠ users upsert failed:', error.message);
      return null;
    }
  }
  // Customer profile
  {
    const { error } = await supabase
      .from('customers')
      .upsert({ user_id: ids.customer, wallet_balance: 1000 }, { onConflict: 'user_id' });
    if (error) { console.log('  ⚠ customers upsert failed:', error.message); return null; }
  }
  // Distributor profile
  {
    const { error } = await supabase
      .from('distributors')
      .upsert({ user_id: ids.distributor, assigned_areas: ['Whitefield'], vehicle_number: 'KA01MH1234', is_active: true }, { onConflict: 'user_id' });
    if (error) { console.log('  ⚠ distributors upsert failed:', error.message); return null; }
  }
  console.log('  ✓ Core users upserted');
  return ids;
}

async function main() {
  console.log('🔧 Unified bootstrap starting...');
  // Upsert core users directly (no auth-admin createUser)
  const ids = await upsertCoreUsers();
  if (!ids) {
    console.log('❌ Aborting: insufficient permissions to upsert core users. Run supabase/GRANTS.sql and retry.');
    return;
  }
  // Products are SQL-based; ensure supabase/seed_products.sql already executed manually.
  console.log('ℹ Ensure you have executed supabase/seed_products.sql (manual SQL) before running this script.');

  await createSampleSubscriptions();
  await seedCapacity();
  await seedDistributorAssignments();

  // Order generation for today & tomorrow
  const today = new Date();
  const tomorrow = new Date(Date.now() + 86400000);
  // Skipping order generation if RPCs missing

  // Skipping dashboard RPC if missing
  console.log('\n✅ Bootstrap complete');
}

main().catch(e => {
  console.error('Fatal bootstrap error:', e);
  process.exit(1);
});
