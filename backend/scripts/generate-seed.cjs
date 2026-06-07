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

fs.writeFileSync(outputPath, JSON.stringify(seedData, null, 2), 'utf8');
console.log(`Generated seed data for ${seedData.length} campsites in ${outputPath}`);
