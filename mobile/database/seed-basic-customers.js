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

async function seedBasicCustomers() {
  console.log('▶ Seeding 5 basic customers (no address dependencies)');
  const customers = [
    { uid: '20000000-0000-0000-0000-000000000001', name: 'Test One', phone: '+910000000001' },
    { uid: '20000000-0000-0000-0000-000000000002', name: 'Test Two', phone: '+910000000002' },
    { uid: '20000000-0000-0000-0000-000000000003', name: 'Test Three', phone: '+910000000003' },
    { uid: '20000000-0000-0000-0000-000000000004', name: 'Test Four', phone: '+910000000004' },
    { uid: '20000000-0000-0000-0000-000000000005', name: 'Test Five', phone: '+910000000005' },
  ];

  for (const c of customers) {
    // users row
    const { error: userErr } = await supabase
      .from('users')
      .insert({ id: c.uid, email: `${c.name.toLowerCase().replace(/ /g,'.')}@seed.test`, name: c.name, phone: c.phone, role: 'customer' })
      .single();
    if (userErr && !/duplicate/i.test(userErr.message)) throw userErr;

    // customers profile (wallet 0)
    const { data: existing, error: dupErr } = await supabase
      .from('customers')
      .select('id')
      .eq('user_id', c.uid)
      .single();
    if (!existing) {
      const { error: custErr } = await supabase
        .from('customers')
        .insert({ user_id: c.uid, wallet_balance: 0 })
        .single();
      if (custErr) throw custErr;
    }
    console.log(`  ✓ ${c.name}`);
  }
  console.log('✓ Done.');
}

seedBasicCustomers().catch(e => { console.error('❌ Seed failed:', e.message); process.exit(1); });
