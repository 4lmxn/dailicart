/**
 * Profile Backfill Script
 * Creates missing customer/distributor profile rows for existing users.
 * Run AFTER schema + GRANTS + auth seed.
 *
 * Usage:
 *  $env:EXPO_PUBLIC_SUPABASE_URL="..."; $env:SUPABASE_SERVICE_ROLE_KEY="..."; npm run seed:profiles
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function backfillProfiles() {
  console.log('🌱 Starting profile backfill...');

  // Fetch all users
  const { data: users, error: usersErr } = await supabase
    .from('users')
    .select('id, role');
  if (usersErr) throw new Error('Failed fetching users: ' + usersErr.message);

  // Existing customer user_ids
  const { data: customers, error: custErr } = await supabase
    .from('customers')
    .select('user_id');
  if (custErr) throw new Error('Failed fetching customers: ' + custErr.message);
  const existingCustomerIds = new Set(customers.map(c => c.user_id));

  // Existing distributor user_ids
  const { data: distributors, error: distErr } = await supabase
    .from('distributors')
    .select('user_id');
  if (distErr) throw new Error('Failed fetching distributors: ' + distErr.message);
  const existingDistributorIds = new Set(distributors.map(d => d.user_id));

  let createdCustomers = 0;
  let createdDistributors = 0;

  for (const u of users) {
    try {
      if (u.role === 'customer' && !existingCustomerIds.has(u.id)) {
        const { error: upErr } = await supabase
          .from('customers')
          .insert({ user_id: u.id, wallet_balance: 0 });
        if (upErr) throw upErr;
        createdCustomers++;
        console.log(`   ✅ Created customer profile for user ${u.id}`);
      } else if (u.role === 'distributor' && !existingDistributorIds.has(u.id)) {
        const { error: upErr } = await supabase
          .from('distributors')
          .insert({ user_id: u.id, assigned_areas: [], is_active: true });
        if (upErr) throw upErr;
        createdDistributors++;
        console.log(`   ✅ Created distributor profile for user ${u.id}`);
      }
    } catch (e) {
      console.error(`   ❌ Failed profile for user ${u.id}: ${e.message}`);
      if (e.code === '42501') {
        console.error('      👉 Permission denied: ensure GRANTS & RLS policies allow service role.');
      }
    }
  }

  // Counts after backfill
  const { count: custCount } = await supabase.from('customers').select('*', { count: 'exact', head: true });
  const { count: distCount } = await supabase.from('distributors').select('*', { count: 'exact', head: true });

  console.log('\n✅ Profile backfill complete');
  console.log(`📊 Customers total: ${custCount} (+${createdCustomers})`);
  console.log(`📊 Distributors total: ${distCount} (+${createdDistributors})`);
  console.log('🧪 Next: run product seed SQL then orders seed.');
}

backfillProfiles().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
