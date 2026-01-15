/**
 * Auth Seeding Script for Supabase
 * Creates test accounts: customer, distributor, admin
 * 
 * Prerequisites:
 * 1. Run supabase/FRESH_START_schema.sql first
 * 2. Set environment variables (or update .env file):
 *    - SUPABASE_URL
 *    - SUPABASE_SERVICE_ROLE_KEY (not anon key!)
 * 
 * Run: node database/seed-auth.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Use service role key (has admin privileges)
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // NOT the anon key!

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Error: Missing environment variables');
  console.error('Required: EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Deterministic test accounts (IDs replaced by real auth IDs after creation)
const TEST_ACCOUNTS = [
  {
    email: 'customer@test.com',
    password: 'test123',
    name: 'Test Customer',
    phone: '+919876543210',
    role: 'customer',
    profile: { wallet_balance: 1000.0, area: 'Whitefield' }
  },
  {
    email: 'distributor@test.com',
    password: 'test123',
    name: 'Test Distributor',
    phone: '+919876543211',
    role: 'distributor',
    profile: { assigned_areas: ['Whitefield'], vehicle_number: 'KA01MH1234', is_active: true }
  },
  {
    email: 'admin@test.com',
    password: 'test123',
    name: 'Test Admin',
    phone: '+919876543212',
    role: 'admin',
    profile: null
  }
];

async function seedAuth() {
  console.log('🌱 Starting auth seed process...\n');

  const createdAccounts = [];

  // Preload existing auth users (if schema was dropped, auth table persists)
  const { data: existingAuthUsersData, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) {
    console.error('❌ Failed to list existing auth users:', listErr.message);
    console.error('   Seeding aborted.');
    return;
  }
  const existingAuthUsers = existingAuthUsersData.users || [];
  const existingByEmail = new Map(existingAuthUsers.map(u => [u.email, u]));

  for (const account of TEST_ACCOUNTS) {
    console.log(`📝 Processing ${account.role}: ${account.email}`);

    try {
      let authUserId;
      if (existingByEmail.has(account.email)) {
        // Already exists in auth.users, update metadata to ensure consistency
        const existingUser = existingByEmail.get(account.email);
        authUserId = existingUser.id;
        console.log('   ⚠️  Auth user already exists (auth.users), ensuring metadata sync...');
        await supabase.auth.admin.updateUserById(authUserId, {
          email_confirm: true,
          user_metadata: {
            name: account.name,
            phone: account.phone,
            role: account.role,
          },
        });
        console.log('   ✅ Metadata synced for existing auth user');
      } else {
        // Create new auth user
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email: account.email,
          password: account.password,
          email_confirm: true,
          user_metadata: {
            name: account.name,
            phone: account.phone,
            role: account.role,
          },
        });
        if (authError) throw authError;
        authUserId = authData.user.id;
        console.log(`   ✅ Created auth user (ID: ${authUserId})`);
      }

      // 2. Create/update public.users record
      const { error: userError } = await supabase
        .from('users')
        .upsert({
          id: authUserId,
          email: account.email,
          name: account.name,
          phone: account.phone,
          role: account.role,
        }, { onConflict: 'id' });
      if (userError) {
        console.error('   ❌ Upsert public.users failed:', userError.message);
        console.error('      If this is permission denied, run GRANTS.sql then retry.');
        throw userError;
      }
      console.log('   ✅ Synced public.users row');

      // 3. Create profile if needed
      if (account.role === 'customer' && account.profile) {
        const { error: profileError } = await supabase
          .from('customers')
          .upsert({
            user_id: authUserId,
            wallet_balance: account.profile.wallet_balance,
          }, { onConflict: 'user_id' });
        if (profileError) {
          console.error('   ❌ Upsert customers failed:', profileError.message);
          throw profileError;
        }
        console.log('   ✅ Synced customer profile');
      }
      if (account.role === 'distributor' && account.profile) {
        const { error: profileError } = await supabase
          .from('distributors')
          .upsert({
            user_id: authUserId,
            assigned_areas: account.profile.assigned_areas,
            vehicle_number: account.profile.vehicle_number,
            is_active: account.profile.is_active,
          }, { onConflict: 'user_id' });
        if (profileError) {
          console.error('   ❌ Upsert distributors failed:', profileError.message);
          throw profileError;
        }
        console.log('   ✅ Synced distributor profile');
      }

      createdAccounts.push({ email: account.email, id: authUserId, role: account.role });
      console.log(`   ✨ Completed ${account.email}\n`);

    } catch (error) {
      console.error(`   ❌ Error processing ${account.email}:`, error.message);
      if (error.code === '42501') {
        console.error('   👉 Permission denied: Run supabase/GRANTS.sql then retry seeding.');
      }
      console.log('');
    }
  }

  // Verification: list counts
  const { count: userCount } = await supabase.from('users').select('*', { count: 'exact', head: true });
  const { count: customerCount } = await supabase.from('customers').select('*', { count: 'exact', head: true });
  const { count: distributorCount } = await supabase.from('distributors').select('*', { count: 'exact', head: true });

  console.log('✅ Auth + public table sync completed!\n');
  console.log(`🔎 Users total: ${userCount}`);
  console.log(`🔎 Customers total: ${customerCount}`);
  console.log(`🔎 Distributors total: ${distributorCount}`);
  console.log('👤 Created Accounts Snapshot:', createdAccounts);
  console.log('📋 Test Credentials:');
  console.log('┌─────────────────────────────────────────────┐');
  console.log('│ Customer Account                            │');
  console.log('│ Email: customer@test.com                    │');
  console.log('│ Password: test123                           │');
  console.log('├─────────────────────────────────────────────┤');
  console.log('│ Distributor Account                         │');
  console.log('│ Email: distributor@test.com                 │');
  console.log('│ Password: test123                           │');
  console.log('├─────────────────────────────────────────────┤');
  console.log('│ Admin Account                               │');
  console.log('│ Email: admin@test.com                       │');
  console.log('│ Password: test123                           │');
  console.log('└─────────────────────────────────────────────┘');
}

// Run the seeding
seedAuth().catch(console.error);
