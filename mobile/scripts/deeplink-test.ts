// Simple deep link test harness. No network/device, just URL parse checks.
const { URL } = require('url');

function test(urlStr: string): void {
  const u = new URL(urlStr);
  const path = u.pathname.replace(/^\//, '');
  console.log(`Testing: ${urlStr} => path=${path}`);
  // basic expectations for our configured routes
  if (path.startsWith('admin/customers/')) {
    const id = path.split('/')[2];
    if (!id) throw new Error('Missing customerId in admin/customer detail');
  }
  if (path.startsWith('admin/distributors/')) {
    const id = path.split('/')[2];
    if (!id) throw new Error('Missing distributorId in admin/distributor detail');
  }
  if (path.startsWith('admin/subscriptions/')) {
    const id = path.split('/')[2];
    if (!id) throw new Error('Missing subscriptionId in admin/subscription detail');
  }
  if (path.startsWith('distributor/buildings/')) {
    const id = path.split('/')[2];
    if (!id) throw new Error('Missing buildingId in distributor/buildings');
  }
  console.log(' ✓ OK');
}

function main() {
  const examples = [
    'dailicart://customer/products',
    'dailicart://admin/customers/abc123',
    'dailicart://admin/distributors/dist-9',
    'dailicart://admin/subscriptions/sub-7',
    'dailicart://distributor/buildings/B42',
  ];
  examples.forEach(test);
}

main();
