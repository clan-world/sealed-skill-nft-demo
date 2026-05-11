import fs from 'node:fs';

const required = [
  'README.md',
  'docs/RUNBOOK.md',
  'docs/ARCHITECTURE.md',
  'docs/THREAT_MODEL.md',
  'apps/web-demo/package.json',
  'apps/api/package.json',
  'apps/tee-broker/package.json',
  'apps/tee-creator/package.json',
  'apps/tee-runtime/package.json',
  'packages/crypto/package.json',
  'packages/protocol/package.json',
  'programs/sealed-skill/programs/sealed-skill/src/lib.rs',
  'infra/aws/terraform/main.tf'
];

let ok = true;
for (const file of required) {
  if (!fs.existsSync(file)) {
    console.error(`Missing ${file}`);
    ok = false;
  }
}
if (!ok) process.exit(1);
console.log('Self-check passed: key repo files exist.');
