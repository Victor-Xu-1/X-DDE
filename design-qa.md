# 0.3 candidate status — server validation deferred

The owner requested code first and no tests/inference on this PC. This expansion has not had local browser, GPU, multi-GPU, remote scientific service or LLM acceptance. Static lint/type/format results are reported separately in the delivery record; they are not runtime evidence. The prior0.2 installation remains unchanged.

The current capability contract is docs/design/README.md. Required candidate acceptance is docs/server-acceptance.md. The old evidence below applies only to0.2 and must not be attributed to the new frontend/adapters.

GitHub CI for candidate `b4ca494eed79f3480758d30740e148a3b20a8356` passed remotely: `npm run check`, 33 frontend tests (`npm test`), `npm run build`, `uv sync --locked --group dev`, Ruff, 68 backend tests (`pytest -q`) and `uv build --wheel` with packaged-web assertions. [Run evidence](https://github.com/Victor-Xu-1/opendde-workbench/actions/runs/36620549910). The first CI run exposed a help-button/input label association defect; the corrected components and regression test passed. No native scientific or browser acceptance is implied by these results. Later commits must have their own passing checks before promotion.

---
# Workbench 0.2.0 acceptance record — 2026-09-30

## Scope and authority

The owner clarified that the supplied image is style inspiration, not a pixel/layout specification. The capability audit and current boundaries are in `docs/design/README.md`. This revision removes image-derived example projects and their complete asset/loader pipeline, adds native entity workflows and guided/expert operation, and implements direct molecular selection and pocket display controls.

## Validation map and results

| Change / risk | Validation | Result |
| --- | --- | --- |
| DNA/RNA/ion contracts, legacy job compatibility | Input alphabet/FASTA normalization; native JSON mapping; API 422 rejection before execution; real queue persistence and reload | Passed |
| Guided workflows and expert overrides | Correct entity fields, distinct protein chains, ABAG default, explicit standard-model override, profile payloads, preserved mode/workflow drafts | Passed |
| Separate entry/result work areas | Navigation event selects results; switching work area retains input; protein-only analysis omits ligand panels | Passed |
| Molecular selection | Actual 3Dmol parser regression for omitted insertion codes; selected LYS8 resolves to 9 atoms in a real generated CIF; hide/restore and focus | Passed |
| Pocket and display controls | 3/4/5/6/8 Å options, label toggle, surface/ribbon display, bilingual controls, two actual atom clicks yield 1.49 Å | Passed in browser |
| Existing analysis/overlays | Real RDKit/native CIF analysis, two-conformer overlay; display editing disabled while overlaying; ligand properties/pocket omitted for nucleic-only task | Passed |
| Removal and packaging | Type/format checks, no reference imports/assets in product, installable wheel includes both web entries and viewer code | Passed |

Commands run: `npm run check`, `npm test` (**28 frontend tests**), `npm run build`; `uv run --locked ruff check src tests hatch_build.py`, `uv run --locked pytest -q` (**30 backend tests**), `uv build --wheel`. The parser regression uses the real library, isolating only the unused worker-Blob URL boundary in the test environment.

The required suite includes existing CSRF/origin/host, path/symlink, body limit, idempotency, timeout, cancellation and recovery checks. Input additions retain the existing queue and container boundary. Renderer messages require matching origin and parent/frame source; structure loading is restricted to same-origin prediction artifacts. Display edits never rewrite downloaded structures. No new dependency was introduced; lockfile changes are the package version only.

`npm audit --omit=dev` fell back to a retired registry endpoint and failed with HTTP 400. A direct request to the official npm bulk advisory endpoint verified the **16 production packages** from the locked tree and returned **zero advisory packages**. This is not a claim about all development dependencies. The existing 3Dmol chunk-size / optional upstream string-callback `eval` build warnings remain visible; the application uses function callbacks and CSP does not permit unsafe eval.

## Real local GPU / API evidence

- `2368d175-23e5-4f98-b63d-17d2c4830e90`: submitted in the browser with RNA `GUAC`, DNA `GATC`, and MG. General checkpoint, quick preset, succeeded. Native CIF analysis: **170 atoms, three chains**, no false protein–ligand contacts. JSON, CSV and HTML routes remain on the existing artifact path.
- `b28662f8-5de9-4ce4-8e8a-4b282d04b385`: antibody entry dispatched the ABAG checkpoint with two small Trp-cage test chains; succeeded. Named explicitly as a runtime check, **not an antibody accuracy evaluation**.
- Existing standard protein–ligand and three-conformer tasks were reused to verify current parsing, analysis, selection, labels, surface display and overlays. Existing task/project data was preserved.

Browser smoke used the actual local server and Codex in-app browser, including 1448×1086 and 480×844 CSS viewports, with no horizontal page overflow or recorded browser errors. Chinese/English switching, reload persistence, guided/expert fields, task submission, native result loading and direct atom selection were exercised. Viewport overrides were reset. Independent Chrome/Firefox and large production-scale targets were not tested.

Screenshots are local acceptance artifacts under `E:/OpenDDE/evidence/workbench-0.2-*`, outside the repository. GPU task files and local credentials also remain outside Git. Public CI independently installs the locked project and runs the required non-GPU suite.

## Boundaries

The tested runtime uses an 8 GB laptop GPU, BF16 and no MSA/templates. GPU smoke establishes executable integration, not scientific accuracy on full-size systems. Binding-affinity prediction, chemical bond/coordinate editing, minimization, covalent restraints, modified residues, uploaded MSA/templates and LLM design campaigns are not provided by this workbench version. The LLM provider remains unconfigured at the owner's request; no LLM code changed in this revision.
