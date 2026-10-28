import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const html = readFileSync('dist/index.html', 'utf8');
if (!html.includes('/caos/assets/') || html.includes('/caos-game/')) throw new Error('Incorrect Pages asset path');
for (const file of readdirSync('dist/assets')) {
  if (!/\.(js|css)$/.test(file)) continue;
  const content = readFileSync(join('dist/assets', file), 'utf8');
  if (file.includes('sohosai-2025') || /2025-11-0[23]T\d\d:/.test(content))
    throw new Error(`Historical actual records found in ${file}`);
}
console.log('Canonical Pages path and absence of original actual records verified.');
