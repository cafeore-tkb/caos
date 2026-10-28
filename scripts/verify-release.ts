import { execFileSync } from 'node:child_process';
import { SCORING_VERSION } from '../src/training/engine';

const target = process.argv[2];
if (target !== 'api' && target !== 'pages') throw new Error('Choose api or pages');
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const base =
  target === 'api'
    ? 'https://caos-training-ranking.210on.workers.dev/health'
    : 'https://cafeore-tkb.github.io/digital-master-sheet-pages/release.json';

for (let attempt = 1; attempt <= 40; attempt++) {
  try {
    const response = await fetch(`${base}?revision=${revision}&attempt=${attempt}`, {
      headers: { Origin: 'https://cafeore-tkb.github.io', 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const release = await response.json();
    const matches =
      target === 'api'
        ? release.rulesVersion === SCORING_VERSION
        : release.sourceRevision === revision && release.scoringVersion === SCORING_VERSION;
    if (matches) {
      console.log(`${target}: release verified (${revision}, ${SCORING_VERSION})`);
      break;
    }
    throw new Error('The previous release is still being served');
  } catch (error) {
    console.log(`${target}: attempt ${attempt}/40: ${error instanceof Error ? error.message : String(error)}`);
    if (attempt === 40) throw error;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}
