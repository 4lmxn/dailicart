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

async function seedMultipleSocieties() {
  console.log('▶ Seeding societies/towers/units');
  
  const societies = [
    { name: 'Prestige Lakeside Habitat', developer: 'Prestige Group', pincode: '560066' },
    { name: 'Sobha Dream Acres', developer: 'Sobha Limited', pincode: '560087' },
    { name: 'Brigade Orchards', developer: 'Brigade Group', pincode: '562125' }
  ];

  const societyIds = [];
  for (const soc of societies) {
    const { data, error } = await supabase
      .from('societies')
      .insert({ ...soc, is_active: true })
      .select('id,name')
      .single();
    if (error) {
      // If exists, fetch it
      const { data: existing } = await supabase.from('societies').select('id,name').eq('name', soc.name).single();
      if (existing) {
        societyIds.push(existing);
        console.log(`  → Society exists: ${existing.name}`);
        continue;
      }
      throw error;
    }
    societyIds.push(data);
    console.log(`  ✓ Society: ${data.name}`);
  }

  // Towers for each society
  const towerData = [];
  for (const society of societyIds) {
    const towers = ['Tower A', 'Tower B', 'Magnolia Block'];
    for (const towerName of towers) {
      const { data, error } = await supabase
        .from('society_towers')
        .insert({ society_id: society.id, name: towerName, floors: 15, is_active: true })
        .select('id,name,society_id')
        .single();
      if (error) {
        const { data: existing } = await supabase.from('society_towers').select('id,name,society_id').eq('society_id', society.id).eq('name', towerName).single();
        if (existing) {
          towerData.push({ ...existing, societyName: society.name });
          continue;
        }
        throw error;
      }
      towerData.push({ ...data, societyName: society.name });
    }
  }
  console.log(`  ✓ Created ${towerData.length} towers`);

  // Units in first tower of each society (sample)
  const unitData = [];
  for (const tower of towerData.slice(0, 3)) { // 1 tower per society
    const units = [
      { number: 'A-101', floor: 1 },
      { number: 'A-102', floor: 1 },
      { number: 'A-201', floor: 2 },
      { number: 'A-402', floor: 4 },
      { number: 'A-1204', floor: 12 }
    ];
    for (const unit of units) {
      const { data, error } = await supabase
        .from('tower_units')
        .insert({ tower_id: tower.id, ...unit, is_active: true })
        .select('id,number,floor,tower_id')
        .single();
      if (error) {
        const { data: existing } = await supabase.from('tower_units').select('id,number,floor,tower_id').eq('tower_id', tower.id).eq('number', unit.number).single();
        if (existing) {
          unitData.push({ ...existing, towerName: tower.name, societyName: tower.societyName });
          continue;
        }
        throw error;
      }
      unitData.push({ ...data, towerName: tower.name, societyName: tower.societyName });
    }
  }
  console.log(`  ✓ Created ${unitData.length} units`);
  return unitData;
}

async function seedMultipleCustomers() {
  console.log('▶ Seeding multiple test customers');

  const units = await seedMultipleSocieties();

  const customers = [
    { id: '10000000-0000-0000-0000-000000000001', name: 'Rajesh Kumar', phone: '+919876543201', wallet: 1500 },
    { id: '10000000-0000-0000-0000-000000000002', name: 'Priya Sharma', phone: '+919876543202', wallet: 2000 },
    { id: '10000000-0000-0000-0000-000000000003', name: 'Amit Patel', phone: '+919876543203', wallet: 500 },
    { id: '10000000-0000-0000-0000-000000000004', name: 'Sneha Reddy', phone: '+919876543204', wallet: 1200 },
    { id: '10000000-0000-0000-0000-000000000005', name: 'Vikram Singh', phone: '+919876543205', wallet: 800 },
    { id: '10000000-0000-0000-0000-000000000006', name: 'Ananya Desai', phone: '+919876543206', wallet: 1800 },
    { id: '10000000-0000-0000-0000-000000000007', name: 'Karan Mehta', phone: '+919876543207', wallet: 600 },
    { id: '10000000-0000-0000-0000-000000000008', name: 'Divya Nair', phone: '+919876543208', wallet: 2200 }
  ];

  let idx = 0;
  for (const customer of customers) {
    const unit = units[idx % units.length];
    idx++;

    // users
    {
      const { error } = await supabase
        .from('users')
        .insert({ id: customer.id, email: `${customer.name.toLowerCase().replace(/ /g, '.')}@test.com`, name: customer.name, phone: customer.phone, role: 'customer' });
      if (error && !error.message?.includes('duplicate')) throw error;
    }

    // customers profile
    {
      const { data: custData, error: custErr } = await supabase
        .from('customers')
        .insert({ user_id: customer.id, wallet_balance: customer.wallet })
        .select('id')
        .single();
      if (custErr) {
        if (custErr.message?.includes('duplicate')) {
          const { data: existing } = await supabase.from('customers').select('id').eq('user_id', customer.id).single();
          custData = existing;
        } else {
          throw custErr;
        }
      }

      if (!custData) {
        const { data: existing } = await supabase.from('customers').select('id').eq('user_id', customer.id).single();
        custData = existing;
      }

      // Get society_id
      const { data: societyData } = await supabase.from('societies').select('id').eq('name', unit.societyName).single();

      // address
      const { error: addrErr } = await supabase
        .from('addresses')
        .insert({
          customer_id: custData.id,
          society_id: societyData.id,
          tower_id: unit.tower_id,
          unit_id: unit.id,
          is_default: true,
          landmark: 'Near Main Gate',
          delivery_instructions: 'Ring doorbell'
        });
      if (addrErr && !addrErr.message?.includes('duplicate')) throw addrErr;
    }

    console.log(`  ✓ ${customer.name} - ${unit.societyName}, ${unit.towerName}, Unit ${unit.number}`);
  }

  console.log(`✓ Seeded ${customers.length} customers with addresses`);
}

seedMultipleCustomers().catch((e) => {
  console.error('❌ Seed failed:', e.message);
  process.exit(1);
});
