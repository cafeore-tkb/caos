# Current master-sheet presentation snapshot

- Repository: https://github.com/cafeore-tkb/cafeore-pos
- Branch: `main`
- Commit: `173c9f18b71a4435fd967916378ed4df06efdbc4`
- Retrieved: 2026-10-25 (main fetched and public master-sheet inspected)
- Visual reference: https://cafeore-pos.cafeorepos.workers.dev/master-sheet

`components`, `hooks`, `logic`, `icons`, `utils`, and `caos.css` contain the A/C presentation dependency tree from `services/pos/app/caos`. The `common` folder contains the required pure board logic, models and date utilities from the same revision. B/D are excluded from the workspace map and runtime.

Adapters live in `bridge`: `convertBoard` projects the CaOS ticket model into the upstream board/card/cup model, `LegacyBoard` connects actions to the live or training reducer, and `ui` adapts button imports. Source cups preserve original order ids and arrival times through merges. React 19 refs permit null. DispatchBoard adds data attributes used only to compact training rows on short landscape screens.

`useCaosLanes`, `OrderComments`, `useUnfinishedTab`, and `logs` are standalone adapters. Training has fixed personnel (names use the upstream non-editable display, keeping six C rows and both card text lines visible), synthetic order comments with session-local stamp and text replies, no shift feed and no external telemetry. `components/OrderComments.tsx`, `OrderChatPanel.tsx`, reaction assets, card presentation, action tray, timeline highlights and C all-order list are the current main sources. `bridge/OrderComments.tsx` retains the standalone anchored popup; `useCommentPopupPosition` is copied from the same main revision to keep the popup near its anchor and inside the viewport. Existing live-mode API ingestion is preserved; board actions remain local. This port does not connect POS account, comments, printer, shift-feed or backend board-writing APIs.

When updating, compare against the recorded commit, refresh the presentation dependency tree and pure timing rules, retain the A/C-only map, then validate board actions and training scoring together. Do not format upstream snapshots into unrelated source changes.

## 2026-10-25 synchronization

Compared the prior `4b7d7d3` snapshot with `main` at `173c9f18`. Refreshed every existing presentation file and its new local dependency closure, plus pure common board/cup/item contracts. New discard eligibility is copied as a pure function without the production transport/practice imports. A/C remain the only views. React 19 nullable refs, the local button/dialog bridge, and data attributes for training-height adaptation are the only compatibility changes in presentation components.

Training maps all-order status, retained original/rebrew identities and discard confirmation to its local reducer. Commentary uses upstream chat, badges and stamp rendering; text replies use a session-local editor (`VoiceComment` adapter), not production speech transcription. Account, POS order acceptance, label printer, shifts, served-state writes and external message/backend integrations remain owned by the POS application; they are not simulated as live connections. Number lookup and tutorial instrumentation are standalone controls.

## 2026-10-26 UI alignment

Fetched `cafeore-pos/main@09c3603a` and compared `services/pos/app/caos` with the recorded snapshot: no additional CaOS source changes. Inspected the public `/master-sheet` in both views. Removed standalone training overrides of the timeline row height, C queue width and board minimum height. Training now uses production's view labels, a single operational header, the production `OrderSearchPanel`/`useOrderSearch` (local board only), and the extracted production assignment flow. The `SidePanel` bridge retains production dimensions and outside-click behavior, with standalone close ownership. Search keyboard handling ignores the non-modal tutorial coach. Reason, cup count, destination, and interrupt/continue choices remain available for the training rebrew model; no production writes or printer controls are connected.

## 2026-10-26 interaction parity audit

Rechecked `cafeore-pos/main@09c3603a` and the public master sheet, including the emergency input. Ported the production `EmergencyForm` and its pure `useEmergencyDraft` dependency, `TicketDetailPanel`, `MoveCardButtons`, and `LanePanel`. The standalone panel shell now includes the production move handle and dimensions. Shared Button/Input variants and original-discard dialog sizing/typography follow the POS primitives. Printer and remote mutation hooks are excluded; the emergency confirm button uses the production practice wording. The training reducer registers the actual selected cup identities, preserves reasons, places remakes first in unassigned, keeps the original brew running, and supports cancellation before a remake starts. Tutorial guidance follows registration, assignment, completion, and original disposal.

Assignment choices use non-modal native popovers while retaining their original card DOM ownership and pointer/drag targets. This escapes nested scroll clipping and ancestor stacking contexts; placement follows scrolling/resizing and keeps both rows within the viewport. This deliberately repairs an upstream-style clipping failure on compact training screens. Card layout, queue geometry, colors, nomination rules, and A/C presentation otherwise remain the production snapshot. Training retains fixed fictional personnel, a separate practice/game header, local-only comments and persistence, and explicit close ownership for standalone panels.
