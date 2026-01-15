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

async function upsertTestCustomer() {
  const userId = '00000000-0000-0000-0000-000000000001';
  console.log('▶ Upserting test customer');

  // users row
  {
    const { error } = await supabase
      .from('users')
      .upsert({ id: userId, email: 'customer@test.com', name: 'Test Customer', phone: '+919876543210', role: 'customer' }, { onConflict: 'id' });
    if (error) throw new Error('users upsert failed: ' + error.message);
  }

  // customers profile
  {
    const { error } = await supabase
      .from('customers')
      .upsert({ user_id: userId, wallet_balance: 1000 }, { onConflict: 'user_id' });
    if (error) throw new Error('customers upsert failed: ' + error.message);
  }

  console.log('✓ Test customer upserted');
}

upsertTestCustomer().catch((e) => {
  console.error('❌ Seed customers failed:', e.message);
  process.exit(1);
});
