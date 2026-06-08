const fs = require('fs');
const path = require('path');

const inputPath = path.join(__dirname, '../../data/campsites.json');
const outputPath = path.join(__dirname, '../kv-seed.json');

const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

const slugify = (text) =>
  text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-');

const seedData = data.features.map((feature) => {
  const props = feature.properties;
  const id = props.id || slugify(props.name);
  
  return {
    key: id,
    value: JSON.stringify({
      ...props,
      // Reservation-opening dates aren't sourced yet (the availability webapp is
      // deferred); ship an empty list rather than fake placeholder dates.
      reservation_dates: [],
      full_description: props.notes,
    }),
  };
});

// The collector + read API read the whole inventory from KV under a single
// `_inventory` key (src/inventory.ts) — KV is the runtime source of truth, the
// bundled campsites-index.json is the fallback. Seed that key from the same
// committed inventory so local/CI KV matches what a deploy pushes to remote KV
// (.github/workflows/deploy-kv.yaml).
const inventory = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../src/campsites-index.json'), 'utf8'),
);
seedData.push({ key: '_inventory', value: JSON.stringify(inventory) });

fs.writeFileSync(outputPath, JSON.stringify(seedData, null, 2), 'utf8');
console.log(`Generated seed for ${seedData.length - 1} campsites + the _inventory key in ${outputPath}`);
