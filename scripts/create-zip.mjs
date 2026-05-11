import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';

const out = '/mnt/data/sealed-skill-nft-demo.zip';
if (existsSync(out)) rmSync(out);
execFileSync('zip', ['-r', out, 'sealed-skill-nft-demo', '-x', '*/node_modules/*', '*/data/*', '*/dist/*', '*.zip'], {
  cwd: '/mnt/data',
  stdio: 'inherit'
});
console.log(`Created ${out}`);
