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
- Automatic release: updating caos `main` validates the app, checks the matching Worker rules, then publishes and verifies GitHub Pages directly from the same repository. See `docs/DEPLOYMENT.md`.
- Manual frontend fallback: `npm run publish:pages` from main

`rankingConfig.ts` contains only the public Worker origin; `VITE_RANKING_API_URL` can override it. Never put credentials in Vite variables. D1 identifiers are resource metadata. Wrangler uses the operator's existing authentication.

## Display-name-only participation

No registration or login is shown. Players enter only a display name before playing; the frontend automatically publishes the replay under that frozen name after scoring. The frontend silently creates a random device session when starting a standard game; its bearer token only protects that run's ownership. Sessions last 45 days. There is no password processing and no credential-entry endpoint. Legacy columns/records remain for migration compatibility.

Rankings and name-based profiles are public. After local scoring, the user explicitly chooses a display name and presses the publish button. Unpublished games do not count toward rankings or grade cohorts. Equal trimmed display names identify one participant across devices; changing the name on a shared device creates an independent participant without renaming prior scores. Use distinct display names for different people. No names are required to play or keep a local history.

Migration 0003 backfills existing named results into participants without discarding scores. Run ownership stays tied to the original private device session; public responses expose participant IDs and display names only. Password hashes, device tokens and usernames are never returned in rankings.

## Score contract

`src/training/engine.ts` is the shared scoring implementation. `SCORING_VERSION` separates incompatible scoring rules. The server issues each run's seed and derives its Fast/Middle/Full scenario from the canonical template. Basket size and restricted-order slots stay balanced; coffee names are shuffled between equal-quantity, equal-restriction slots and arrival times vary deterministically. Full mode uses 44 orders / 66 coffee cups over 30 simulated minutes (110% of the 40-order / 60-cup rush baseline). Rule v3 separates these records from older workloads. Total cups, products and potential revenue stay the same per mode. Publication contains a display name and validated operations, not a claimed score. The Worker replays and scores the run, checks ownership and elapsed wall time against the maximum 10x clock, and saves it once. Retries of the same trace and display name are idempotent. A different name cannot overwrite an already published run. A submitted custom score, personnel-change action or another user's run is rejected. This validates simulation results; it does not prove a human operated the browser.

Rules `2026-10-v2` show two independent scores:

- Master /100: completion 35, within eight minutes 25, extraction quality 20, same-order completion within 60 seconds 10, suitable single-iced-cup allocation 10. Existing completion/quality/no-violation/no-unresolved-emergency pass gates remain. When a non-nominated single iced cup could be assigned to a senior whose queue wait is at most 60 seconds longer, at least half of those completed cups must go to seniors to pass. Otherwise the master score caps at 79. Busy senior lanes and nominated cups are exempt. Completed two-cup batches are exempt from the single-cup rule.
- Business /pt: sound completed coffee sales at the supplied master prices (1 yen = 1 point), plus nomination 100/cup, limited 150/cup, and actual merged two-cup batch 100/pair. Original cup identities prevent rebrews or repeated merges from duplicating sales/bonuses. Business points do not override master qualification.

Rankings can switch metrics and show one best result per display name and mode for the current rules version, 100 players per page. Both scores displayed belong to that selected best attempt. Equal values of the selected metric have equal competition ranks. Within a tie, master score, completion, quality, elapsed simulation time and completion date determine display order. Attempts are counted once. Custom JSON and old browser-only records remain local, because no server-issued run verifies them. Named attempts are sent only on explicit publication, with a bounded retry queue. Online publishing also works if browser storage is unavailable. Pending runs expire after 24 hours; expired submissions do not block newer records. Existing local history is preserved.

The daily maintenance trigger removes expired sessions, rate-limit buckets and unfinished expired runs; it retains completed results. SQL uses bound parameters. Device creation and run creation/publication have bounded rate limits. The API permits the GitHub Pages origin; run creation, submission and private grade lookup require the invisible device-session token.

## Letter grades

Grades are presentation metadata; the v2 scoring formula and existing records remain comparable. A+ requires BOTH a score of at least 95 AND a full tied group strictly below 10 percent of current-rule participants in that mode. A is at least 80 without qualifying for A+, B 70–79, C 60–69, D below 60 (fail). The denominator is distinct display-name participants with a published run; only each name's best master score contributes. `atOrAbove * 10 < population` excludes exactly 10 percent, including a one-person top rank in a ten-person cohort. Point-only and singleton-cohort grades stop at A. The 80-point operational-readiness standard remains independent of academic-style pass/fail.

Ranking rows and public `/profile?name=...` statistics contain current `assessment` metadata. `GET /runs/:id/grade` returns an owner's verified completed run's current assessment. The result screen saves a snapshot in browser history. Rankings may change as people join/improve. The grading policy identifier `95-and-top10-v1` prevents old OR-based snapshots from being interpreted as current grades; original scores and history remain intact.

Full v3 evaluates queued work using the same timeline start and end times, without advancing the actual clock. The canonical replay automatically finishes once all orders are assigned and emergencies are handled; projected cups and revenue are explicitly marked as estimates. Actual short extractions and unassigned/unarrived cups cannot be repaired by forecasting.


Rule v4 adds per-order score explanations and fixes merge/split cup preservation and remake registration timestamps. Deploy the Worker and UI from the same revision. Existing v3 results remain stored and are excluded from the v4 ranking cohort.

Rule v5 adds the fixed butchi and shawn recreated scenarios with a seven-minute queue lead. Apply migration 0004 before deploying this Worker; it extends the mode constraint while preserving all old runs. The original full-day actual dataset is not included.

Rule v6 derives advanced-mode staff abilities and separate single/double brew factors from the run seed. Fixed recreated orders keep their sequence. The same seed drives client timing and server replay, and old-rule results remain stored separately.

Historical rankings remain available across scoring-version upgrades. `/rankings?mode=full&rulesVersion=all` returns separate bests and ranks per participant and scoring version; `rulesVersion=<version>` filters one version. The UI defaults to all versions. An unspecified version retains current-version behavior when populated and falls back to a populated earlier version otherwise. Public profiles and local best summaries retain all completed attempts. Existing scores and traces are never rewritten during this display upgrade.

`GET /results/:runId` returns the public summary of a completed, named game. Ranking rows include the selected best game's `run_id`. The summary contains score categories and visible draw outcomes, without the seed, private device identity, trace, or hidden timing factors. New submissions save the roster and emergency occurrence/response facts in `result_json.conditions`; older current-rule games can recover draw outcomes only, and older-rule games show those details as unavailable. Existing results are never rescored or rewritten by reads.
