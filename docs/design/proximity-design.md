# 诱导邻近与双功能设计

This module implements R42 and R47–R56 of the sole roadmap in
[README.md](README.md). It owns no second task queue or scientific asset store.
The ordinary flow remains one questionnaire step per screen, fresh materials by
default, explicit historical-file selection, selected native method, and actual
3D/2D results with downloads. This note is developer documentation, not a product
page. A roadmap entry or downloaded archive is not an installed usable method.

## Biological intent determines the workflow

| Research type | What is modeled | What geometry alone cannot establish |
| --- | --- | --- |
| PROTAC | Protein of interest, full degrader and E3 substrate receptor; both binding arms, linker and protein interface | Ubiquitination, degradation percentage, DC50/Dmax, cellular exposure |
| RIPTAC | Targeting protein, full heterobifunctional molecule and essential effector protein | Selective cellular inhibition, expression dependence or therapeutic window |
| Molecular glue | One molecule stabilizing or inducing a protein interface; no compulsory two-arm/linker split | Novel substrate recruitment or functional activity |
| Other protein–protein induced proximity | Explicit partner roles and the full bridging molecule | Mechanism-specific activity, recruitment or catalysis |
| Two-target independent binder | Separate compatible binary poses and full-molecule properties | Simultaneous bridging unless actually modeled and checked |
| Binder plus payload/probe | Retained binding region, attachment point and complete modified molecule | Payload delivery, cleavage or biological function |

RIPTAC uses the general three-component geometry machinery without relabeling its
effector as an E3 ligase or claiming degradation. RNA-recruiting systems, membrane
assemblies, covalent linkages, antibody conjugates and larger assemblies need
their actual native chemistry/representation support before submission is enabled.
Molecular-glue discovery does not reuse a two-fragment linker generator as a
substitute for interface design.

## Methods selected for implementation

| Method | Intended role | Verified source / current boundary |
| --- | --- | --- |
| DeepTernary | Fast multiple ternary hypotheses, separate PROTAC and MGD checkpoints; CPU and CUDA entrypoints | Official Apache-2.0 source at 827821dccca31a5918bd0355e2d6bf70c072b6dd; source and official weights downloaded and hashed; X-DDE adapter/native scientific validation pending |
| P4ward | Protein–protein sampling followed by full-PROTAC/linker modeling from two binary complexes; classical complementary method | GPL-3.0 source at 2d5cf1c0dc88083995b707371199b56444513fe6; MEGADOCK is CC-BY-NC-4.0; source downloaded, pinned runtime/native validation pending |
| REINVENT4 / LinkInvent | Generate explicit attachment-point fragment linkers with property objectives | Existing peer environment has native linker mode; add exact region/attachment lineage and full-graph handoff, not another molecular generator |
| DiffLinker | Optional pocket/3D-conditioned linking alternative | Candidate pending version/weights/protocol acceptance; not a universal replacement for LinkInvent |
| Boltz-2 | Independent all-component structural hypotheses, particularly when sequences are the starting material | Existing peer environment; preserve actual input contracts and model-specific confidence. No automatic affinity option for a three-component degrader |
| RDKit / PoseBusters / PLIP / structural analysis | Full graph/stereo, pose plausibility, local contacts and interface evidence | Reuse existing adapters with explicit partner/atom correspondence; no invented generic aggregate activity score |
| OpenMM / OpenFF | Restrained local full-complex refinement and recorded force-field energy | Existing adapter includes an exact bound ligand and OpenFF 2.2.1; test representative full ternary inputs. Vacuum/local minimization is not a binding free-energy calculation |
| PRosettaC / Rosetta | Optional classic comparison and local/interface refinement | Actual Rosetta/PatchDock licenses and reproducible compatible runtime required; no redistribution under X-DDE Apache-2.0 |
| GlueFinder | Optional interface-pocket hypothesis generation | Academic/evaluation terms require separate review; not a default universally open runtime |

Defaults depend on material availability and matched scientific evidence. A paper's
benchmark average, a BSA threshold, model confidence, geometric contact count and
cellular degradation are different evidence types. Do not rank raw scores from
different methods by averaging them.

## Shared data and execution contracts

- Retain the two partner identities, full chemical molecule/version, source binary
  poses, atom maps, logical binding/linker regions and coordinate transforms.
  Unknown binding arms first create explicit binary hypotheses through existing
  workflows; never silently invent a docking origin.
- Derive attachment directions from actual bonds/local coordinates. A dummy atom
  denotes an explicitly chosen chemical attachment; no arbitrary world-axis arrow.
- Keep a complete stereochemical graph through graph cuts, caps, linker generation,
  rejoining, conformer generation and structure normalization. Each transformation
  has a parent and atom correspondence; rejected proposals remain diagnostics.
- Normalize a native complex into actual partner structures plus an SDF retaining
  the authoritative full ligand graph. A PDB atom cloud is not sufficient chemical
  evidence. Check all component identities, proper transforms, severe collisions,
  retained binding contacts, anchor geometry and chemical plausibility independently.
- Save multiple nonredundant assemblies/clusters with model-specific measurements
  and actual representative structures. Do not sum two binary docking scores to
  infer ternary cooperativity.
- Run bounded jobs in the existing Router/Worker, with isolated component
  environments, model digests, CPU/GPU/memory/time/output limits and explicit native
  exit checks. Reuse the existing cancellation/recovery and version authorities.
- Existing region, workflow, pose-set, evidence and experimental-condition records
  supply the relationship network. No parallel workbench, queue or asset catalogue.

## Upstream behavior requiring adaptation

DeepTernary's official prediction script can fall back from chemical substructure
matching to distance-based Hungarian assignment. X-DDE must validate exact
graph/stereo/atom maps before execution and reject mismatched output rather than
silently accepting that fallback. Its successful-conformer loop also needs an
outer finite attempt/wall budget; a partial/failed search is not a completed
requested ensemble. Select explicit checkpoint files instead of falling back to
an older directory.

P4ward's supplied Dockerfile uses mutable base/dependency clones. Build a separate
reviewed, immutable environment rather than running that recipe unmodified.
Preserve noncommercial dependency terms. Its preparation/cleanup choices and
protein-interface/E3 geometry filters must be explicit and mechanism-specific;
do not apply E3/ubiquitination filters to RIPTAC or general proximity systems.

## Representative acceptance

Use deposited BRD4–MZ1–VHL (5T35) as a known full-PROTAC example, an additional
unbound/cross-system degrader, and real molecular-glue complexes with source-backed
chemical identity: lenalidomide–CRBN–CK1α (5FQD) and CC-885–CRBN–GSPT1 (5HXB). Include atom renumbering, common rigid motion, opposite
stereochemistry, mismatched anchors, broken/stretched bonds, severe partner
collisions, unsupported elements, empty pockets and exhausted budgets.
A source reconstruction is separate from prospective/generalization validation.
Compare matched inputs under declared methods, seeds and budgets before switching
defaults. Protein/ligand/interface RMSD requires a real reference; predicted RMSD
surrogates are labeled model scores, not measured error.

The module result view prioritizes one adjustable 3D assembly with partner toggles,
a Ketcher ligand/region view, a candidate table and interface/quality evidence.
Download full complexes, intact-ligand poses, partner structures and selected
plots. Fixed native examples stay inside the module, never in personal history.

## Primary sources

- [DeepTernary official source](https://github.com/youqingxiaozhua/DeepTernary)
- [DeepTernary paper](https://www.nature.com/articles/s41467-025-61272-5)
- [P4ward official source and dependency notices](https://github.com/SKTeamLab/P4ward)
- [P4ward paper](https://doi.org/10.1021/acs.jcim.5c00614)
- [LinkInvent original method](https://pubs.rsc.org/en/content/articlehtml/2023/dd/d2dd00115b)
- [PRosettaC](https://github.com/LondonLab/PRosettaC)
- [RIPTAC original study](https://doi.org/10.1016/j.chembiol.2024.07.005)
- [GlueFinder source](https://github.com/hzhou3ga/gluefinder)

The upstream DeepTernary README invokes an MGD-mode example using 6HR2.
RCSB identifies 6HR2 as a SMARCA4–VHL PROTAC 2 complex. Retain that fact;
do not use it as a molecular-glue biological reference merely because of a CLI
mode label. Also distinguish the BRD4/VHL core ternary system in 5T35 from its
ElonginB/ElonginC accessory chains and duplicated crystal assemblies. Every
case must declare which actual chains/assembly are supplied and evaluated.

Verified structural sources:
[5T35](https://www.rcsb.org/structure/5T35),
[6HR2](https://www.rcsb.org/structure/6HR2),
[5FQD](https://www.rcsb.org/structure/5FQD),
[5HXB](https://www.rcsb.org/structure/5HXB).

## Implementation evidence for the first native integration

The first DeepTernary CPU adapter passed the real managed installer, model-resource
verification, sole Router/Worker/supervisor, exact molecular/partner references,
whole-ligand and proper-transform validation, bounded proposal count, independent
geometry/stereochemistry checks, negative inputs and altered output rejection.
The in-module MZ1 public case returned three complete core assemblies. All three
remain diagnostic because the full contact/steric acceptance criteria did not pass.
No thresholds were relaxed to obtain a qualified candidate.

[Native/API/browser evidence](https://github.com/Victor-Xu-1/X-DDE/actions/runs/37635909792)
includes real Ketcher drawings, 3D previews, structure downloads, fresh-input defaults,
one visible questionnaire step and compact layouts. Case bundle SHA-256:
``02a5638ae60d3d72631b38ea0985339b88abac19ff2317fb246ea5b21d6c43fc``.
It is independent data, restored idempotently without scientific execution or
personal task-list additions. Code changes after that capture require their own
focused checks.

This establishes executable software integration for the recorded PROTAC case,
not external prediction accuracy, RIPTAC/glue benchmark acceptance, P4ward
integration, ternary free energy or complete R42/R47–R56 delivery. Those remaining
items continue under the single platform roadmap.

The next candidate corrects mechanism-specific initialization: the official MGD
protocol retains the observed partner frames and corrects the ligand against
observed `x`, whereas PROTAC randomizes initialized poses and uses `new_x` for
correction. The two protocols must not share that initialization. Isolated checks
use deposited 5FQD chains B/C with its 19-heavy-atom LVY instance and 5HXB chains
Z/X with its 31-heavy-atom 85C instance. Both declare omitted DDB1, structural
zinc and duplicate crystal copies. Exact public input hashes and native graph/
forward parity are checked before accepting the integration; parity is not
prospective scientific accuracy or validation of the omitted components.
The native input snapshot is [proximity-inputs-v1](https://github.com/Victor-Xu-1/X-DDE/releases/tag/proximity-inputs-v1),
SHA-256 `cbeb500bfede8086d957279acfc6d6827f66590874a0ced06b3d97f3b1a531c2`.
ModelServer SDF responses include per-request timestamps and timings; the original
reviewed responses are frozen rather than weakening checksum verification or
changing the expected digest on each run. This input-only data release is separate
from computed examples and software publication versions.

[Isolated native verification](https://github.com/Victor-Xu-1/X-DDE/actions/runs/37646304573)
passed independent official MGD graph/forward-input comparison, original partner
initialization, observed-ligand correction and complete typed native outputs for
both 5FQD and 5HXB. Each returned three proposals; neither case had a proposal
passing all independent geometric gates. This establishes executable core-system
integration while keeping predictive accuracy and experimental acceptance pending.

Result acceptance also covers 1280px, 1366px and 1600px desktop widths. Candidate
table headings remain horizontal and the table fits its assigned desktop column;
when there is insufficient space the complete-complex preview leads a single
column layout. Requested/returned counts share one statistic rather than separate
repeated panels. Exported original metrics and scientific qualification remain
unchanged.

The next initialization correction keeps the original whole-ligand `x` separate
from the generated conformer's `new_x`, and uses the upstream proper Kabsch
transform to place that generated conformer in the observed molecular frame
before random initialization. The known binary pocket coordinates and the whole
conformer consequently receive the same centering and rigid transform. This
does not change source coordinates, chemical identities, internal distances or
qualification thresholds. Isolated acceptance compares real RDKit conformers and
native graph coordinates with an independent row-vector Kabsch reference,
translation covariance and the source poses, then executes the sole native
adapter. These checks establish input consistency; predictive accuracy remains
subject to the actual returned structures and independent gates.
