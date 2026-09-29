# Design direction and capability contract

The owner-provided `reference.png` remains unchanged as style inspiration only: light surfaces, blue accents and readable scientific controls. Its labels, project cards and plots are not feature specifications. Image SHA-256: `0d65a4b5acde90c80469a4bcc013b623d43021bbf90a2b90e29452b59f10b842` (1448 × 1086).

## Source authority

- OpenDDE commit `ddfa1df8aff1babf1fddac4247b7d2351bd0ce9f`: `runner/cli.py`, `runner/batch_inference.py`, `runner/msa_search.py`, `runner/dumper.py`, `docs/infer_json_format.md` and model manifest.
- Harness source baseline `6510a6f6f4a845193739684830931826c7ad73a9`: `core/contracts.py`, `core/runtime.py`, `core/detached.py`, `core/validation.py`, `servers/api.py`, `servers/client.py`, scientific backends and CLI. The inspected local distribution also contains previously installed UI/localization and API changes; those are not copied into this repository. Deploy the audited compatible runtime, and run server contract acceptance before changing upstream versions.
- Native model: `opendde_v1`; released general and ABAG checkpoints. Operator-registered custom checkpoints use the same model architecture contract.

## Coverage matrix

The rows below describe **implemented code paths**, not completed runtime acceptance. All new integrations require the target-server checks in `docs/server-acceptance.md`.

| Actual upstream ability | Frontend entry and controls | Execution and result path |
| --- | --- | --- |
| `pred`: protein/ligand/DNA/RNA/ion, single and mixed assemblies | Predict structures; six guided workflows and expert component controls | Typed native JSON → pinned CLI → real CIF and confidence |
| Copies, explicit chain IDs, modified residues | Per-component expert fields | Exact native `id`, `count`, `modifications` |
| SMILES, CCD, file ligands | Text or immutable uploaded SDF/MOL/MOL2/PDB | Native `FILE_` binding; multiple SDF records rejected for a single prediction ligand |
| Covalent input bonds | Native atom inspection; select atoms in the preview or searchable list | Native atom metadata → validated entity/copy/position/atom fields → `covalent_bonds` |
| Seeds, samples, cycles, steps, dtype | Presets and expert controls | Native flags; multi-seed result IDs and aligned filenames remain unique |
| TFG and atom confidence | Expert toggles with explanations | Native geometry guidance / `need_atom_confidence`; no invented potency model |
| CPU/CUDA, kernels, caching/fusion/TF32, determinism | Expert controls | CLI flags; Linux target; MPS is not a supported deployment backend here |
| FoldCP | GPU indices and distributed toggle | Native `torchrun`, DP=1, CP=device count; requires multiple server GPUs |
| Standard, ABAG, custom checkpoint | Model selection and server checkpoint registry | Read-only model mounts; no browser-supplied checkpoint paths |
| Uploaded MSA and templates / online search | Feature choices and component file pickers | Explicit network setting, managed A3M/template paths |
| `msa`, `mt`, `prep` | Feature-preparation form | Native commands and stable `prepared-input.json`, including native outputs written outside the original output directory |
| `json` | PDB/CIF import; altloc, assembly and discontinuous-bond options | Native converter; review/import resulting native inputs before prediction |
| Native multi-job inputs | JSON import, per-task review and batch submit | One transactional batch, stable idempotency keys; no partial enqueue |
| `doctor` and native data installer | Resources and diagnostics | Official command / manifest-backed helper; explicit downloads, no automatic large install during prediction |
| Native PAE/PDE/contact probabilities/atom pLDDT | Confidence panel and raw download | Actual `_full_data_sample_*.json`; bounded, labelled sampling |
| Harness antibody campaigns | VHH/scFv/VH-VL, target/scaffold/CDR/fixed positions, budget; complete expert JSON and YAML import | Native config loader and detached controller; reviewed digest, durable handoff and reconciliation |
| Design policies and tools | Expert design JSON: all native science settings, schedules, weights, parent policy, model/token limits, gates, terminal refolding | Original Harness parser remains scientific authority; credentials/URLs/executables remain operator settings |
| Campaign lifecycle | Status, phase, candidates, structure preview, stop, batch-size/reflection adjustment, recovery after browser refresh | Native task store/controller; no duplicate agent or lifecycle engine |
| ESM score | Sequence-score form | Native `/score/esm` |
| ESM2 guided proposals | Parent chains and clickable mutable positions | Native `/generate/esm2-guided` |
| SolubleMPNN | Managed structure, parent chains, mutable positions and expert settings | Native `/generate/soluble_mpnn` |
| Candidate folding and objectives | Candidate/target chain editor and expert scientific options | Native asynchronous `/fold`; polling and cancellation |
| Target MSA | Target name, chain and sequence | Native `/search/msa/target`; depth/cache metadata |
| Epitope and hotspot analysis | Structure/chain/CDR inputs, cutoff, expert hotspots; one-click campaign report | Native `/analysis/epitope` |
| PLIP analysis | Up to three structures with target/binder chains; campaign report | Native `/analysis/structure` |
| Target-aligned binder RMSD | Reference/mobile structures and chain selections | Native `/analysis/pose-rmsd` |
| Evolution, conservation and structural history | Candidate JSON input; original campaign history report preserves native structure context | Native `/analysis/evolution-tree`, including configured FoldMason dependencies |
| ProTrek sequence/structure search | Sequence or structure+chain and result count | Native search APIs; missing service is reported unavailable |
| Candidate population/top results | Campaign ranking, full candidate details, structure and population download | Native controller/client; population writes remain owned by the design workflow |
| Compare two candidate populations | Two JSON inputs, top-k and expert direction | Original `core.validation.compare_runs` used by native CLI `compare` |
| Standalone molecular descriptors (Workbench extension) | Property form, up to 500 SMILES/file records | RDKit MW/LogP/TPSA/QED/SA/HBD/HBA/rotatable bonds; actual CSV/JSON |
| Molecular display (Workbench extension) | Ligand ball/stick, ribbons, nearby residues, styles, selection, distance and overlays | Existing 3Dmol dependency and real CIF/PDB parsing |

## Deliberately absent

The public Harness `servers/backends/developability_filter.py` is a stub returning `available: false`. There is no objective-developability prediction card; native LLM campaign quality assessments retain their provenance. No generic small-molecule de novo, complete ADMET or calibrated-affinity model was found in the audited published implementation. Deprecated/ignored `msa_server_mode` and redundant `use_default_params` are not fake controls. Training and proprietary editor features are not part of the audited inference distribution.

Service shutdown, arbitrary population replacement, provider secrets, arbitrary command/path execution and native application administration are not scientific task modules. Operator configuration is documented rather than proxied unrestrictedly to the browser.

## Interaction rules

Chinese/English labels; guided choices first; expert controls preserve values. File inputs can come from uploads or completed task artifacts. Native fields are never silently discarded on import. Invalid inputs, missing prerequisites, partial/unavailable results and unsupported cancellation are visible.

The input preview is not a predicted pose. Visual edits preserve coordinates. Adding a covalent bond changes a new task's topology explicitly. Native confidence is not potency; proximity is not hydrogen-bond classification. No numerical result or structure originates from the reference image.

Display limits are Workbench guardrails, not model limits: 20 tasks per atomic batch; 25 MiB per uploaded file; 500 molecules per property task; at most 64 predicted conformers from the supported sample/seed controls; confidence display samples large matrices. Complete native artifacts remain available when permitted by task output limits.
