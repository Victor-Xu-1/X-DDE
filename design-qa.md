# Design and usability QA — 2026-09-29

final result: passed

## Scope and visual authority

Source: `docs/design/reference.png`, 1448 × 1086, SHA-256 `0d65a4b5acde90c80469a4bcc013b623d43021bbf90a2b90e29452b59f10b842`.
The owner subsequently requested removal of unavailable controls and a guided workflow for medicinal chemists. The authorized changes are documented in `docs/design/README.md`; the source image remains unmodified.

The desktop comparison used a completed prediction in the 1448 × 1086 CSS viewport. Blue/white palette, approximately 200 px navigation, 60 px header, reference cards, input/viewer/results columns and lower interpretation panels are retained. Real structures and metrics replace illustrative values. There are four implemented shortcuts and three meaningful interpretation panels, as required by the usability revision.

Local capture records: `workbench-desktop-final.png` and `workbench-mobile-final.png`, retained outside the repository in the deployment evidence folder. Captures were inspected; extra empty capture canvas was cropped to the verified CSS viewport. The screenshot does not substitute for interaction testing.

## Findings resolved

- Removed non-executable generation, affinity, optimization and benchmark entries, empty affinity values, arbitrary radar normalization and redundant chart displays.
- Replaced exposed numerical setup with three task choices and three presets. Advanced parameters are collapsed; missing optional models are rejected by the API and omitted from new-task choices.
- Renamed candidates to conformers. Added real multi-conformer alignment/overlay, residue selection, native-unit descriptors and accessible explanations.
- Corrected same-origin viewer framing, stale structure retention, premature surface-ready state, empty-project selection and draft loss during navigation.
- Replaced obsolete green tokens and removed abandoned layout rules. Split the application into state, workspace, utility-page, input, result and viewer modules.
- Corrected the narrow-screen toolbar overlap. At 480 × 844 CSS pixels, navigation labels remain available, the form starts below the toolbar and there is no document horizontal overflow.

No unresolved P0/P1/P2 visual or core-flow issue was observed. P3: the compact desktop layout uses vertical page scrolling for the full guided input and interpretation content.

## Actual verification

Browser: Codex in-app browser against the running local service. No claim of a separate Safari/Firefox/Chrome-extension run.

- Submitted a standard protein–ligand prediction and a three-conformer prediction through the UI; parsed 157-atom structures and real model summaries.
- Three generated conformers aligned successfully; subsequent RMSD values were approximately 0.33 and 0.42 Å. Two-conformer overlay displayed and residue-list selection located the selected residue in 3D.
- Created a local project, verified its empty result state, used the caffeine example and quick preset, and obtained a completed task linked to that project.
- A separate ABAG checkpoint smoke test completed. This validates runtime/checkpoint execution only, not antibody-design accuracy.
- Verified language switching and refresh persistence, preserved unfinished input when navigating to Help and back, exercised tooltip hover/focus/click/Escape, and inspected empty/loading/completed states.
- Downloaded the actual CSV and HTML report via browser controls and checked their task identifiers and computed content.
- Browser error log was empty at the end of the checked flows.

Commands run: `npm run check`, `npm test` (19 tests), `npm run build`; `uv run --locked ruff check src tests hatch_build.py`, `uv run --locked pytest -q` (21 tests), and `uv build --wheel`. The built wheel includes the application entry page, viewer entry page and PDB reference assets.

Security checks exercised origin/CSRF/host validation, body limits, UUID and sequence validation, path/symlink containment, HTML escaping, bounded output, idempotency, cancellation, timeout and restart recovery. Reference image checksum was verified; no credential patterns or model/runtime data were found in the source intended for publication. npm reported zero known vulnerabilities for the locked dependency tree.

Build notes: the isolated 3Dmol viewer bundle exceeds the bundler's 500 kB warning threshold and its upstream optional callback parser triggers an eval warning. Application code supplies function callbacks only; CSP does not enable unsafe-eval. The viewer and tested surface/selection flows ran with that policy.

LLM-provider validation is not applicable to this workbench release: the owner deferred model-provider configuration, and no nonfunctional agent entry is exposed. Computational predictions are not experimental potency validation.
