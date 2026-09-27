#!/usr/bin/env node
// Import prepared Census JSON with service-role credentials. Never run in a browser.
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-flyer-population.mjs /tmp/spoylt-population-2024.json
import { readFile } from 'node:fs/promises';
const path = process.argv[2];
const supabase = process.env.SUPABASE_URL?.replace(/\/$/, '');
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!path || !supabase || !secret || !/^https:\/\/.+\.supabase\.co$/.test(supabase)) {
  throw new Error('Provide prepared JSON, SPOYLT SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
}
const records = JSON.parse(await readFile(path, 'utf8'));
if (!Array.isArray(records) || !records.length) throw new Error('No population records.');
for (let i = 0; i < records.length; i += 250) {
  const response = await fetch(`${supabase}/rest/v1/flyer_population_areas?on_conflict=state_fips,area_type,geo_code,estimate_year`, {
    method: 'POST',
    headers: {
      apikey: secret, Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(records.slice(i, i + 250)),
  });
  if (!response.ok) throw new Error(`Supabase import failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
}
process.stdout.write(`Imported ${records.length} sourced population areas.\n`);
