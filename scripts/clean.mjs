import fs from 'node:fs/promises';

for (const path of ['data', 'dist', '.turbo']) {
  await fs.rm(path, { recursive: true, force: true });
}
console.log('Cleaned local generated files.');
