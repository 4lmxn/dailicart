#!/usr/bin/env node
/**
 * Seed script to assign distributors to towers
 * Creates distributor_building_assignments so "My Buildings" screen shows data
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error('❌ Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function seedDistributorAssignments() {
  console.log('▶ Seeding distributor tower assignments...\n');

  // 1. Get all distributors
  const { data: distributors, error: distErr } = await supabase
    .from('distributors')
    .select('id, user_id, users(name, email)')
    .limit(10);

  if (distErr) throw distErr;
  if (!distributors || distributors.length === 0) {
    console.log('⚠️  No distributors found. Run seed-distributors.js first.');
    return;
  }

  console.log(`Found ${distributors.length} distributor(s)`);

  // 2. Get all society towers
  const { data: towers, error: towerErr } = await supabase
    .from('society_towers')
    .select('id, name, society_id, societies(name)')
    .eq('is_active', true);

  if (towerErr) throw towerErr;
  if (!towers || towers.length === 0) {
    console.log('⚠️  No towers found. Run seed-multiple-customers.js first.');
    return;
  }

  console.log(`Found ${towers.length} tower(s)\n`);

  // 3. Assign each distributor to towers (round-robin)
  let assignmentCount = 0;
  for (let i = 0; i < distributors.length; i++) {
    const distributor = distributors[i];
    const distributorName = distributor.users?.name || distributor.users?.email || distributor.id;
    
    // Assign 2-3 towers per distributor
    const towersToAssign = [
      towers[i % towers.length],
      towers[(i + 1) % towers.length],
      towers[(i + 2) % towers.length]
    ];

    console.log(`📍 Assigning to ${distributorName}:`);

    for (const tower of towersToAssign) {
      const { error: assignErr } = await supabase
        .from('distributor_building_assignments')
        .upsert({
          distributor_id: distributor.id,
          society_id: tower.society_id,
          tower_id: tower.id,
          assigned_at: new Date().toISOString().slice(0, 10),
          is_active: true
        }, {
          onConflict: 'distributor_id,tower_id'
        });

      if (assignErr) {
        console.log(`   ❌ ${tower.societies?.name} - ${tower.name}: ${assignErr.message}`);
      } else {
        console.log(`   ✅ ${tower.societies?.name} - ${tower.name}`);
        assignmentCount++;
      }
    }
    console.log('');
  }

  console.log(`✅ Created ${assignmentCount} distributor-tower assignments\n`);

  // 4. Verify the assignments work with the function
  console.log('▶ Testing get_distributor_buildings function...\n');
  
  for (const distributor of distributors) {
    const { data: buildings, error: funcErr } = await supabase
      .rpc('get_distributor_buildings', {
        p_distributor_id: distributor.id
      });

    if (funcErr) {
      console.log(`❌ Function error for ${distributor.users?.name}: ${funcErr.message}`);
      continue;
    }

    const distributorName = distributor.users?.name || distributor.users?.email;
    console.log(`📊 ${distributorName}:`);
    console.log(`   Buildings: ${buildings?.length || 0}`);
    
    if (buildings && buildings.length > 0) {
      buildings.forEach(b => {
        console.log(`   - ${b.society_name} / ${b.tower_name}`);
        console.log(`     Units: ${b.total_units || 0}, Subscriptions: ${b.active_subscriptions || 0}`);
      });
    }
    console.log('');
  }
}

seedDistributorAssignments()
  .then(() => {
    console.log('✅ Distributor assignment seeding complete!');
    process.exit(0);
  })
  .catch((e) => {
    console.error('❌ Seed failed:', e.message);
    console.error(e);
    process.exit(1);
  });
