# Target-server acceptance for 0.3

This is the acceptance plan for the X-DDE frontend, platform server and scientific adapters. It is not a record of successful inference. Scientific runtime acceptance is deferred to the target server; the local released package and source preview are separately identified during delivery.

## Preparation

1. Check out the exact candidate commit and record `git rev-parse HEAD`. Verify the API title and `health.platform.name` are X-DDE. Record each selected engine’s revision, runtime/image digest, model/resource identifiers and its own acceptance evidence; OpenDDE is not a prerequisite for unrelated engines. Confirm the platform and asset APIs remain available when scientific environments are missing.
2. Use a separate `WB_STATE_DIR` for acceptance. Keep production state and native campaigns intact. Configure `.env.example`; build/install using README commands.
3. Install the audited scientific runtime, CPU/GPU support and required resources. Configure Harness and provider credentials on the server only. For file-based tools, map `WB_HARNESS_SHARED_DIR` to the native compute output root, with `WB_HARNESS_REMOTE_DIR` identifying the same directory inside compute.
4. Run the existing mandatory frontend/backend/packaging gates. Do not skip or weaken them because inference is deferred.

```bash
cd frontend
npm ci
npm run check
npm test
npm run build
cd ..
uv sync --locked --group dev
uv run --locked ruff check src tests server_tests
uv run --locked pytest -q
uv build --wheel
```

The unit/API suite verifies actual SQLite transactions, filesystem boundaries and real controlled processes. Native IPC is isolated where a real model is unavailable. Those tests do not establish RDKit, GPU, service or LLM correctness.

## Real protocol and scientific implementation

Start the candidate workbench, then run this script on the server:

```bash
python server_tests/smoke.py \
  --url http://127.0.0.1:4320 \
  --output /var/tmp/opendde-acceptance/basic.json

# Explicitly adds a small real multi-seed prediction:
python server_tests/smoke.py \
  --url http://127.0.0.1:4320 --gpu \
  --output /var/tmp/opendde-acceptance/gpu.json
```

The basic script invokes native doctor and atom parsing, and checks real RDKit ethanol descriptors. The GPU case requests two seeds × two samples and requires four distinct candidates/artifacts. Tiny fixtures check execution and parsing, not drug efficacy or structural accuracy.

`--cases /path/to/reviewed-cases.json` accepts a list of reviewed Workbench task requests for additional resource/service paths. Upload fixture files first and use their returned IDs. This option can transmit inputs or consume model resources according to those requests; do not populate it with unreviewed third-party tasks. A timed-out test records failure and leaves the task identifiable for inspection/cancellation. Save evidence outside the Git checkout.

## Change → risk → acceptance mapping

| Changed area | Risk and required server evidence | Pass criterion |
| --- | --- | --- |
| Operation union / queue | Legacy task decoding, new utility result types, cancellation, timeout, restart | Existing tests plus actual property/doctor/inspection jobs succeed without a CIF-only assumption; failed manifests stay failed. |
| Atomic batch | Partial insertion, repeated clicks, retries, capacity | Real API batch creates all or none; same key returns the same IDs; conflicting body gives409. |
| Uploads and result reuse | Traversal, symlinks, corruption, wrong type, deletion race | Malformed inputs rejected before execution; snapshots retain SHA-256; referenced files cannot be deleted; completed CIF/A3M can be reused. |
| Native input parity | Residue/copy/atom numbering, modifications, chain IDs, file ligands | Native parser resolves displayed atom IDs; selected bond endpoints reach `covalent_bonds`; multi-record SDF is rejected for one ligand rather than truncated. |
| Feature preparation | Native msa writes outside the initial output root, missing dependencies, accidental networking | Each of msa/mt/prep publishes a reusable inference document; reimported A3M/template paths point to immutable inputs; unavailable databases fail visibly; offline mode does not search. |
| Prediction switches | Dropped or incompatible options | Native CLI accepts CPU/CUDA, TFG, confidence toggle, kernels, cache/fusion/TF32, determinism and configured checkpoints; output/log records the requested mode. |
| FoldCP | Incorrect rank/GPU mapping | At least two real GPUs complete a native distributed prediction and produce native metrics. A single-GPU run is not equivalent evidence. |
| Multi-seed results | Duplicate conformer IDs / overwritten alignments | IDs, aligned filenames and CSV rows are distinct across seeds and samples. |
| Confidence | Invented/incorrect arrays or misleading axes | PAE/PDE/contact map and pLDDT match the actual native JSON; sampling stride and token indices are visible; disabled/missing files display an explanation. |
| Standalone properties | Requiring prediction first, invalid records hidden, CSV formula injection | Known descriptor values match RDKit; per-record parse failures are shown; SDF library counts are preserved up to the documented bound. |
| Harness scientific tools | Native schema drift, wrong file root, missing dependencies, false success | Real ESM, ESM2, MPNN, fold, MSA, ProTrek, epitope, PLIP, RMSD, evolution and comparison fixtures each return their actual contract. External unavailable flags remain unavailable. |
| Campaign configuration | Wrong CDR offsets, permission loss, stale review | VHH, scFv and VH/VL configs validate with native loader; guided1-based selections map once to native0-based positions; expert fields and uploaded YAML survive review. |
| Native launch | Duplicate work after lost response / restart | Reviewed digest matches; double-start cannot create two campaigns; live launcher identity blocks premature reconciliation; no native task after confirmed launcher exit can be re-reviewed safely. |
| Native lifecycle | Competing controller, hidden orphan work, stale UI | Native phase/cycle/candidates/stop/adjust are reflected accurately, persist through reload and use native IDs. Queued core GPU work waits for app-launched campaigns; uncertain launch is visible and recoverable. |
| Native LLM | Credentials, invalid outputs, tools, timeout/retry and cost/token limits | One approved small real campaign reaches candidates; malformed/unavailable provider behavior yields visible native failure; retry and token limits match the configured native policy; no duplicate campaign is launched. Record actual provider/model/usage, not secrets. |
| Candidate analysis | Loss of original history/structure context | Campaign reports use native in-memory history and original task paths; top candidates open real structures; population JSON can be compared through native compare_runs. |
| UI | Dead modules, language, focus, empty/error/loading behavior | Browser journey below passes at desktop and narrow widths; no unsupported developability/ADMET/de novo/affinity button appears. |

## Real browser journey

Use the browser on the target installation after the real API checks. Record the exact commit, browser/version, viewport, observed results and screenshots outside Git.

1. Load `/`, switch Chinese/English, refresh and verify language persistence; inspect console/network failures.
2. Find molecular properties, submit a small SMILES library, view its real table and download CSV.
3. Convert an uploaded PDB/CIF, import the resulting input, edit it and submit a real prediction. Refresh the task URL and verify task/result restoration.
4. Open guided/expert modes, modify and restore presets without losing additional scientific controls. Check input validation and keyboard labels.
5. Open native atom inspection, choose both covalent endpoints by preview and by list, remove a bond and inspect the submitted native JSON. A viewer button must not accidentally submit the surrounding form.
6. Inspect ligand pocket, change radius, select residues/atoms, hide/restore, measure distance, compare conformers and inspect native confidence. Verify actual data, not merely canvas presence.
7. Run/reuse prepared features; cancel a queued batch item, retry a failed task and inspect preserved logs/results.
8. Validate a small approved antibody design, review its summary, launch once, refresh the page and restore the campaign. Open a real candidate, generate native reports, export a population and compare two populations.
9. Test loss of backend connectivity, unavailable service, missing model and an interrupted launch. Each must retain inputs and provide a recovery path; no fabricated completed results.
10. At approximately1440px and390px CSS widths, check navigation, forms, tables, focus, tooltip interaction and overflow.

## Evidence and promotion

CI and static checks alone do not satisfy the native matrix. Report each row as passed, failed or not yet run with its actual reason. Missing GPU(s), credentials, model weights or external services are unverified dependencies, not successful tests. Preserve the original failures while fixing them.

Promote the candidate only after relevant mandatory gates and real workflows pass. Install the wheel built from that exact commit. Before rollback, use the pre-upgrade state backup; old0.2 cannot parse the new operation types. Keep native Harness tasks and model stores under their own lifecycle and ownership.
