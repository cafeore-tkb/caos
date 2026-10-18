# Current master-sheet presentation snapshot

- Repository: https://github.com/cafeore-tkb/cafeore-pos
- Branch: `main`
- Commit: `4b7d7d3d8a0943a0f437c705d5d0e0fc5c49451b`
- Retrieved: 2026-10-19 (main rechecked after the current-UI correction)
- Visual reference: https://cafeore-pos.cafeorepos.workers.dev/master-sheet

`components`, `hooks`, `logic`, `icons`, `utils`, and `caos.css` contain the A/C presentation dependency tree from `services/pos/app/caos`. The `common` folder contains the required pure board logic, models and date utilities from the same revision. B/D are excluded from the workspace map and runtime.

Adapters live in `bridge`: `convertBoard` projects the CaOS ticket model into the upstream board/card/cup model, `LegacyBoard` connects actions to the live or training reducer, and `ui` adapts button imports. Source cups preserve original order ids and arrival times through merges. React 19 refs permit null. DispatchBoard adds data attributes used only to compact training rows on short landscape screens.

`useCaosLanes`, `OrderComments`, `useUnfinishedTab`, and `logs` are standalone adapters. Training has fixed personnel (names use the upstream non-editable display, keeping six C rows and both card text lines visible), read-only synthetic order comments, no shift feed and no external telemetry. `bridge/OrderComments.tsx` adapts the upstream marks and list to local read-only comments; `useCommentPopupPosition` is copied from the same main revision to keep the popup near its anchor and inside the viewport. Existing live-mode API ingestion is preserved; board actions remain local. This port does not connect POS account, comments, printer, shift-feed or backend board-writing APIs.

When updating, compare against the recorded commit, refresh the presentation dependency tree and pure timing rules, retain the A/C-only map, then validate board actions and training scoring together. Do not format upstream snapshots into unrelated source changes.
