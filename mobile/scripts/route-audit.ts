/* Simple route registry sanity checker (CommonJS). */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const srcDir = path.join(root, 'src');
const typesPath = path.join(srcDir, 'navigation', 'types.ts');

function readFile(p: string): string {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) out.push(...walk(full));
    else if (full.endsWith('.ts') || full.endsWith('.tsx')) out.push(full);
  }
  return out;
}

function extractRouteKeys(typesSource: string): Record<string, Set<string>> {
  const map: Record<string, Set<string>> = {};
  const regex = /export\s+type\s+(\w+)ParamList\s*=\s*{([\s\S]*?)}/g;
  let m;
  while ((m = regex.exec(typesSource))) {
    const listName = m[1];
    const body = m[2];
    const keys = new Set<string>();
    for (const line of body.split('\n')) {
      const km = line.match(/\s*(\w+)\s*:/);
      if (km) keys.add(km[1]);
    }
    map[listName] = keys;
  }
  return map;
}

interface NavigateUsage {
  route: string;
  file: string;
  line: number;
  paramsRaw: string;
}

function extractNavigateUsages(source: string): NavigateUsage[] {
  const lines = source.split('\n');
  const usages: NavigateUsage[] = [];
  const pattern = /navigate\(\s*['"]([A-Za-z0-9_]+)['"]\s*(,\s*\{[^}]*\})?/g;
  lines.forEach((l: string, idx: number) => {
    let m;
    while ((m = pattern.exec(l))) {
        usages.push({ route: m[1], file: '', line: idx + 1, paramsRaw: m[2] || '' });
    }
  });
  return usages;
}

function main() {
  const typesSource = readFile(typesPath);
  if (!typesSource) {
    console.error(`Cannot read navigation types at ${typesPath}`);
    process.exit(2);
  }
  const routeLists = extractRouteKeys(typesSource);
  const allRoutes = new Set<string>();
  Object.values(routeLists).forEach((set: Set<string>) => set.forEach((k: string) => allRoutes.add(k)));

  const files = walk(srcDir);
  const errors: string[] = [];
  let totalUsages = 0;
  // Collect screen names from navigator files as an additional registry
  const screenNames = new Set<string>();
  for (const f of files) {
    const src = readFile(f);
    const screenRegex = /<Stack\.Screen\s+name=\"([A-Za-z0-9_]+)\"/g;
    let m;
    while ((m = screenRegex.exec(src))) {
      screenNames.add(m[1]);
    }
  }
  // Merge screen names into allRoutes
  screenNames.forEach((k: string) => allRoutes.add(k));
  // Param requirements registry (minimal, extend as needed)
  const paramRequirements: Record<string, string[]> = {
    CreateSubscription: ['product'],
    BuildingDeliveries: ['buildingId', 'buildingName'],
    CustomerDetail: ['customerId'],
    DistributorDetail: ['distributorId'],
    SubscriptionDetail: ['subscriptionId'],
  };

  for (const f of files) {
    const src = readFile(f);
    const usages = extractNavigateUsages(src).map((u: NavigateUsage) => ({ ...u, file: f }));
    totalUsages += usages.length;
    for (const u of usages) {
      if (!allRoutes.has(u.route)) {
        errors.push(`${u.file}:${u.line} uses navigate('${u.route}') which is not in any *ParamList`);
      }
      // Param validation: if route requires params, ensure keys exist in inline object
      const required = paramRequirements[u.route];
      if (required && typeof u.paramsRaw === 'string') {
        const presentKeys = new Set<string>();
        // Capture inside braces
        const braceMatch = u.paramsRaw.match(/\{([\s\S]*)\}/);
        const inner = braceMatch ? braceMatch[1] : '';
        // Match both explicit key:value and shorthand identifiers
        const explicitKeyRegex = /(\w+)\s*:/g;
        let km;
        while ((km = explicitKeyRegex.exec(inner))) {
          presentKeys.add(km[1]);
        }
        inner.split(/[,\s]+/).forEach((tok: string) => {
          if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(tok)) {
            presentKeys.add(tok);
          }
        });
        const missing = required.filter((k: string) => !presentKeys.has(k));
        if (missing.length) {
          errors.push(`${u.file}:${u.line} navigate('${u.route}') missing params: ${missing.join(', ')}`);
        }
      }
    }
  }

  console.log(`Checked ${totalUsages} navigate() usages across ${files.length} files.`);
  if (errors.length) {
    console.error(`Found ${errors.length} potential mismatches:`);
    errors.forEach((e: string) => console.error(' - ' + e));
    process.exit(1);
  } else {
    console.log('No route mismatches found.');
  }
}

main();
