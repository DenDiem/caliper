import {readFileSync, writeFileSync} from 'node:fs';

const [version] = process.argv.slice(2);

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`Expected a semver version, got "${version ?? ''}"`);
  process.exit(1);
}

const files = [
  'apps/qa-extension/package.json',
  'apps/ask/package.json',
  'packages/core/package.json',
  'packages/overlay/package.json',
  'packages/recorder/package.json',
];

for (const file of files) {
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  manifest.version = version;
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${file} -> ${version}`);
}

const configFile = 'apps/ask/src/config.ts';
const configSource = readFileSync(configFile, 'utf8');
const versionExportPattern = /export const CALIPER_VERSION = '[^']*';/;

if (!versionExportPattern.test(configSource)) {
  console.error(`Could not find "export const CALIPER_VERSION = '...';" in ${configFile}`);
  process.exit(1);
}

writeFileSync(
  configFile,
  configSource.replace(versionExportPattern, `export const CALIPER_VERSION = '${version}';`),
);
console.log(`${configFile} -> ${version}`);
