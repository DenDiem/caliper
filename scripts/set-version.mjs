import {readFileSync, writeFileSync} from 'node:fs';

const [version] = process.argv.slice(2);

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`Expected a semver version, got "${version ?? ''}"`);
  process.exit(1);
}

const files = [
  'apps/qa-extension/package.json',
  'packages/core/package.json',
  'packages/overlay/package.json',
];

for (const file of files) {
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  manifest.version = version;
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${file} -> ${version}`);
}
