import { execFileSync } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';
import { SCORING_VERSION } from '../src/training/engine';

const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
writeFileSync('dist/release.json', `${JSON.stringify({ sourceRevision, scoringVersion: SCORING_VERSION }, null, 2)}\n`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `scoring-version=${SCORING_VERSION}\n`);
console.log(`Prepared Pages release ${sourceRevision} (${SCORING_VERSION})`);
