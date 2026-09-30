# Design direction and capability contract

The owner-provided `reference.png` remains unchanged as style inspiration only: readable scientific controls. The current owner direction supersedes its blue palette with warm paper surfaces, charcoal typography and restrained clay accents inspired by Claude Science. Its labels, project cards and plots are not feature specifications. Image SHA-256: `0d65a4b5acde90c80469a4bcc013b623d43021bbf90a2b90e29452b59f10b842` (1448 × 1086).

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


## Unified platform architecture and staged expansion

This document remains the capability/design authority. The 2026-09-30 architecture handoff is incorporated here as **planning**, not a claim that additional engines are installed, implemented or scientifically validated. Reviewed implementation baseline: `c8b51244fd960eb8c85e1982ae0955802dc8335f`; setup implementation starts at `ffeab4b31a6687313b7f4577d32f5b5d8832f2bd` and evolves on the same repository.

### Platform and engine responsibilities

OpenDDE Workbench is the project/research workspace. OpenDDE is a structure-prediction engine within it. Organize research around evidence → hypothesis → design → computation → comparison → experimental feedback. A model accepting a ligand, peptide or nucleic acid does not establish a complete validated research workflow for that object. Confidence, docking scores, affinity and measured activity remain distinct.

Keep a modular control backend, the existing frontend and isolated scientific environments. Domain modules communicate through versioned scientific objects and typed step requests, never another module's private routes or scripts. Do not introduce a second job queue, antibody campaign loop or general agent runtime. Native Harness remains authoritative inside its campaigns; Workbench stores immutable handoffs, campaign identifiers, idempotency and reconciliation state.

### Domain matrix

| Domain | Current boundary | Proposed extension / status |
| --- | --- | --- |
| Structures and complexes | Existing OpenDDE inputs, prediction, confidence and comparison | Server runtime/scientific acceptance pending |
| Molecular drawing and structures | Ketcher, Mol*, existing 3Dmol; immutable saved molecule assets | Bidirectional stable atom/residue selections and constraint editing planned |
| Small-molecule properties | RDKit descriptors | Molecular states/conformers, series optimization and predictive ADMET are separate planned capabilities |
| Protein / antibody design | Native Harness campaigns and scientific tools | Shared candidate/object provenance planned; do not duplicate its workflow authority |
| Targets and binding sites | Existing residue/pocket inspection | P2Rank/fpocket adapters planned; review incremental benefit and licenses |
| Binding modes and selectivity | Structure inspection, alignment and PLIP | GNINA, validated constrained search and receptor ensembles planned |
| Refinement and simulation | No new simulation backend in this release | OpenMM/OpenFF adapters, parameterization and explicit model conditions planned |
| Linked / multicomponent assemblies | Native mixed-entity prediction within supported input contract | TERNIFY and research adapters require input, license, benchmark and weight acceptance |
| Quality and evidence | Raw artifacts and identified confidence/descriptor sources | PoseBusters/FreeSASA only where they add validated capability; standardized measurements planned |
| Experiments and series feedback | Not implemented as an experiment domain | Assay/condition/unit/batch/replicate import and candidate association before active learning |

Each capability must independently record: planned, adapter implemented, real execution verified, scientific benchmark verified. New generation, synthesis planning, ADMET or free-energy domains must not appear as usable cards until a real adapter and acceptance evidence exist.

### Shared contracts

Evolve existing `projects`, `assets`, `requests`, provenance and persistent task records rather than mechanically adding synonymous classes. Version project/objective/hypothesis; molecule/molecular-state with stereochemistry and atom maps; sequence/structure/ensemble with chain/residue maps and coordinate transforms; site/selection/constraint; candidate/set/complex; workflow/run/step/attempt; artifact/measurement/experimental-observation/evidence.

Inputs, topology, engine/image/weights, parameters, seed and parent provenance define reproducibility and cache keys. Edited molecules invalidate outdated atom indexes. Chain/residue and file conversions occur only at engine boundaries. Preserve both original outputs and normalized records. Invalidate downstream steps only when their scientific inputs change.

Constraint contracts record target/reference objects and coordinate frames, phase, hard/soft semantics, threshold/weight, provenance, conflicts and satisfaction. Capability adapters distinguish native enforcement, adapter enforcement, result-only checking and unsupported constraints. Never silently weaken a hard constraint or replace constrained search with post-filtering.

Measurements retain name, value, units, direction, method/version, conditions, applicability and uncertainty only when actually available. Do not invent a cross-engine total score; use comparable conditions, explicit gates and explainable multi-objective/Pareto choices. Experimental observations are separate from predictions.

### Reuse, change and additions

- Reuse `Store`/`Worker` as the Workbench execution authority. Add dependency/step/attempt records, bounded branching, resource leases, cancellation propagation and output-based recovery there when a real multi-step workflow is implemented.
- Evolve `Engine` and the current Docker adapter into explicit capability/environment registration. Keep scientific serialization in adapters (`native_arguments`, task IO, Harness bridge), not frontend fields or routes.
- Extend component management with reviewed releases, license/weight terms, capability probes and in-use version protection. Installation operations remain distinct from scientific runs and must coordinate resource use.
- Reuse Ketcher/Mol*/3Dmol through typed selection/mapping contracts; editor state is not the sole scientific data authority.
- Keep loopback single-user security. Remote workers or teams require explicit authentication, storage and concurrency design; do not expose this server as a team deployment merely by changing its bind address.
- LLM assistance may propose plans and explain evidence. Typed validation, budgets and trusted adapters authorize execution; the model cannot supply arbitrary shell commands or assert an unobserved result.

### Delivery and acceptance order

1. **Foundation:** inventory real abilities and licenses; version scientific object, constraint, measurement, engine and run contracts; regress affected current workflows. Avoid directory reshuffling before these boundaries exist.
2. **Composed execution:** extend the current execution chain with a real multi-engine workflow. Validate bounded candidate × receptor × molecular-state expansion, leases, failures, restart recovery, cancellation, cache invalidation and provenance using reproducible public examples.
3. **Domain expansion:** introduce binding-mode, series and assembly adapters with consistent object reuse and comparison. Separate software integration evidence from independent scientific benchmarks and failure cases.
4. **Feedback and scale:** experiment import, validated iterative decisions, then optional model calibration, remote resources and team operation driven by measured needs.

These phases describe dependencies, not permission to implement every new research domain in the current setup/UI change. Current release acceptance remains installation, lifecycle, component management, editor interaction and the existing mandatory regressions; GPU/LLM/large-database acceptance remains on the target server.
