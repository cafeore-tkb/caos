# CaOS shared ranking

GitHub Pages remains the frontend. `caos-training-ranking` is a dedicated Cloudflare Worker with its own D1 database. It does not access the POS or shift backend.

## Run and publish

Use Node 22. `npm install`, then:

- Local database: `npx wrangler d1 migrations apply DB --config worker/wrangler.jsonc --local`
- Local API: `npm run worker:dev` (port 8787; permits localhost:3041)
- Local frontend: `npm run dev -- --port 3041`
- Backend integration: `npm run worker:test` while the API is running. This creates fictional accounts only in the local database by default.
- Remote database: `npm run worker:migrate`
- Remote API: `npm run worker:deploy`
- Public frontend: `npm run publish:pages` from main

`rankingConfig.ts` contains only the public Worker origin; `VITE_RANKING_API_URL` can override it. Never put credentials in Vite variables. D1 identifiers are resource metadata. Wrangler uses the operator's existing authentication.

## Identity and visibility

Registration uses a public display name, unique lowercase username, and password. Passwords are salted and derived using Web Crypto PBKDF2-SHA256 (100,000 iterations). Only hashes are stored. Bearer sessions use 256 random bits, are stored hashed in D1, and expire after 30 days. Logging out revokes that session. Names and scores are visible to other registered players. Passwords and tokens never appear in ranking responses. There is currently no email-based password recovery.

## Score contract

`src/training/engine.ts` is the shared scoring implementation. `SCORING_VERSION` separates incompatible scoring rules. The server issues each run's seed and derives its Fast/Middle/Full scenario from the canonical template. Basket size and restricted-order slots stay balanced; compatible baskets and arrival times vary deterministically. Total cups, products and potential revenue stay the same per mode. Submission contains only validated operations, not a claimed score. The Worker replays and scores the run, checks ownership and elapsed wall time against the maximum 10x clock, and saves it once. Retries of the same trace are idempotent. A submitted custom score, personnel-change action or another user's run is rejected. This validates simulation results; it does not prove a human operated the browser.

Rules `2026-10-v2` show two independent scores:

- Master /100: completion 35, within eight minutes 25, extraction quality 20, same-order completion within 60 seconds 10, suitable single-iced-cup allocation 10. Existing completion/quality/no-violation/no-unresolved-emergency pass gates remain. When a non-nominated single iced cup could be assigned to a senior whose queue wait is at most 60 seconds longer, at least half of those completed cups must go to seniors to pass. Otherwise the master score caps at 79. Busy senior lanes and nominated cups are exempt. Completed two-cup batches are exempt from the single-cup rule.
- Business /pt: sound completed coffee sales at the supplied master prices (1 yen = 1 point), plus nomination 100/cup, limited 150/cup, and actual merged two-cup batch 100/pair. Original cup identities prevent rebrews or repeated merges from duplicating sales/bonuses. Business points do not override master qualification.

Rankings can switch metrics and show one best result per player and mode for the current rules version, 100 players per page. Both scores displayed belong to that selected best attempt. Equal values of the selected metric have equal competition ranks. Within a tie, master score, completion, quality, elapsed simulation time and completion date determine display order. Attempts are counted once. Custom JSON and old browser-only records remain local, because no server-issued run verifies them. New ranked attempts are sent after scoring, with a bounded retry queue in that browser. Pending runs expire after 24 hours; expired submissions do not block newer records. Existing local history is preserved.

The daily maintenance trigger removes expired sessions, rate-limit buckets and unfinished expired runs; it retains completed results. SQL uses bound parameters. Registration/login and run creation/submission have bounded rate limits. The API permits the GitHub Pages origin; private endpoints also require authentication.
