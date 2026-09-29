# Fixed visual reference

`reference.png` is the unmodified design image supplied by the project owner on 2026-09-29. It is the visual authority for this workbench. Do not replace it with a newer generated concept or a screenshot of the implementation. Any future change to the reference requires the owner's explicit instruction.

SHA-256: `0d65a4b5acde90c80469a4bcc013b623d43021bbf90a2b90e29452b59f10b842`.

## Layout contract

- Desktop reference: 1448 × 1086 pixels, light theme, blue/white clinical research workspace.
- Persistent left navigation about 200 px wide; horizontal application header about 60 px tall.
- Content order: product title/description, seven capability cards, project examples, workflow tabs, input/viewer/candidate-table columns, then analysis charts.
- Main area at the reference width: input approximately 265 px; viewer approximately 440 px; remaining width for candidate results. Compact 8–12 px gaps, restrained 5–8 px radii, fine pale-blue borders.
- Typography: system sans with Chinese fallback; deep navy headings, medium-blue actions, muted blue-gray secondary copy. Use an established outline icon family, not glyph drawings.
- Standard / ABAG mode, quick-start guidance, model readiness, task state, selected candidate and downloads must reflect actual application state.

## Scientific-content boundary

This image is a design specification, not a scientific dataset. Its molecule names, candidate counts, affinity values, scores and plots must never be imported as computed results. Actual viewer contents, candidate tables and charts come from user inputs and generated artifacts. Metrics absent from the installed engine display an explanation rather than a made-up number. Illustrative reference content is not validation of drug activity.

The MIT license applies to the independently authored workbench code. The supplied image is retained as owner-provided design material; this file does not assert ownership over third-party marks or biological datasets depicted in it.

## Owner-authorized usability revision (2026-09-29)

The owner subsequently requested removal of unsupported/ineffective modules, guided choices, and plain-language hover explanations for medicinal chemists. The original image stays fixed as the palette and layout reference; the following functional revisions take precedence over its illustrative controls:

| Audited element | Implemented decision |
| --- | --- |
| De novo generation, calibrated affinity, structure optimization, benchmark placeholders | Removed navigation, empty pages and affinity table column. The help page records actual engine boundaries. |
| Seven duplicated capability shortcuts | Four working shortcuts: prediction, 3D inspection, conformer comparison, export. |
| Raw parameter form | Three task types and three presets. Advanced parameters are collapsed; optional ABAG appears only when installed. |
| Candidate molecule wording | Renamed predicted conformers; no claim of newly generated compounds. Real alignment supports 2–3 conformer overlays. |
| Mixed-unit bars, arbitrary normalized radar and empty scatter | Replaced with native-unit molecular descriptors, result interpretation and clickable nearby residues. |
| Unexplained scientific labels | Shared accessible tooltip component for SMILES, sequences, parameters, confidence, descriptors and contact distances. |
| Read-only molecular preview | Atom/residue selection, residue-list positioning, view choices, zoom, chain location and real CIF loading. |
| Navigation discarded unfinished input | Input and preset choices remain in memory while visiting other sections. No input is persisted in browser storage. |

Parameter presets are workflow conveniences, not scientific guarantees. Public structure cards are browser examples, never prediction input templates or activity claims.
