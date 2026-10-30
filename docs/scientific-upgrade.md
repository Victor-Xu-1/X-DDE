# Scientific environment upgrade

X-DDE owns the platform API, asset versions, deployment queue, task queue, cancellation,
recovery and scientific relationship graph. Each program below runs in its own immutable
environment through the same task envelope. None starts a separate workbench or task database.

| Environment | Reviewed version | Task and output |
|---|---|---|
| Chemistry | RDKit 2026.03.6 / Dimorphite-DL 2.1.0 | Molecular states, descriptors, native minimization |
| Receptors | Biopython 1.88 | Structure preparation and alignment |
| ADMET | ADMET-AI 2.0.1 / Chemprop 2.3.1 | Existing pretrained endpoints with their original model identities |
| Boltz | 2.2.1, Boltz-2 model family | Complex structures, confidence and native affinity predictions |
| REINVENT | 4.8 | Analogue, scaffold, linker and QED/MW/LogP-directed generation |
| LigandMPNN | 26ec57ac976ade5379920dbd43c7f97a91cf82de | Selected-residue sequence design and optional packed structures |
| BoltzGen | 0.3.2 | Protein/peptide design and scaffold-based antibody variable-region design |
| Refinement | PDBFixer 1.12.0, OpenMM 8.6.1, OpenFF Toolkit 0.19.0 | Resolved-atom preparation and restrained vacuum minimization |
| Electrostatics | PDB2PQR 3.7.1 / APBS 3.4.1 | Coordinate-bound DX potential in kBT/e at recorded conditions |
| Interactions | PLIP 3.0.1 / Open Babel 3.2.1 | Classified protein–ligand and protein-interface contacts in the original coordinate frame |
| Property modeling | Chemprop 2.3.1 | Scaffold-split regression, held-out plots and reusable native models |
| Structure editor | Mol* 5.13.0 | Integrated editor; the main preview continues using 3Dmol 2.5.5 |

The OpenMM environment uses RDKit 2025.09.6 because AmberTools 26.0 and that RDKit
conda build share Boost 1.86. The independent chemistry and ADMET environments use
RDKit 2026.03.6. OpenFF's base toolkit and Interchange base package provide the actual
SMIRNOFF/AM1-BCC flow; unrelated neural charge-model dependencies are not required by
this adapter. AmberTools' bundled analysis/preparation metadata requires NumPy 1.26.4
and Biopython 1.85 in this environment; the independent receptor adapter uses 1.88.
The supplementary pip lock excludes these conda-provided packages and OpenMM, so pip
cannot silently replace the reviewed OpenMM runtime with an older PyPI wheel.
OpenMMForceFields 0.16.0 is installed from the checksum-verified official
source archive after its declared scientific dependencies. Dependency locks include
immutable conda artifact URLs/SHA-256 and pip hashes.

## Research inputs and results

Interrupted or failed BoltzGen studies can explicitly inspect and continue their
calculated stages. The original task stays stopped and its files remain unchanged;
the continuation is a new task in the same queue. X-DDE verifies the original
request, recipe, exact native image and bounded CIF/NPZ byte inventory, then mounts
the source read-only and uses BoltzGen 0.3.2's `--reuse` option. The design plan,
inputs and resource budget cannot change during continuation. Changed, incomplete,
oversized or redirected checkpoints fail before native execution. Fresh studies
never receive this flag. Completed stages are reused; this does not imply that
uncontrolled sampling is seed-reproducible, or that a completed binder binds in
experiment. Final results still require the normal native report and scientific
review, plus a sealed reference to their source checkpoint.

Protein-interface analysis uses the same managed PLIP environment and task queue as
small-molecule interaction profiling. Select one to three complete complexes and
disjoint target/partner chain sets. Each comparison retains its exact source input,
full contact table, and native XML/TXT reports. The result validator compares all
reported contact classes, including water bridges, with the full native report;
missing or truncated contacts cannot be accepted as a complete result.

Deposited modified-polymer annotations survive mmCIF-to-PDB transport. Selected
polymer residues must all survive the native preparation. The web viewer uses exact
deposited residue identities to classify modified polymer residues, without changing
their names, bonds, coordinates, or source downloads. Historical Harness structure
tasks remain in their original module; new interface tasks use the managed PLIP 3
adapter. Contact distances and counts do not measure affinity or interaction energy.

New tasks start with fresh materials. Explicitly choosing a historical file or a module
template preserves its exact asset, record, conformer and checksum. PDB-only programs
can consume a CIF through a derived PDB with preserved author chain/residue identities;
unrepresentable identities are rejected. Original files are never overwritten.

Boltz's current adapter uses single-sequence mode for protein components. Ligand input
can be an explicitly selected SDF/MOL record or SMILES. Model affinity is not an
experimental binding measurement. BoltzGen antibody mode designs a selected variable
framework chain; it does not promise whole-IgG design. Its upstream pipeline controls
randomness; the UI does not expose an unsupported seed override.

The locked BoltzGen 0.3.2 bridge explicitly uses one device, zero DataLoader
workers and diffusion batch size one. These are native CLI controls, not new
model dependencies. Larger requests remain sequential at the diffusion-batch
level; the existing container CPU/memory ceilings still apply and insufficient
resources can fail a run. Native weights, ranking and scientific filters are
unchanged. A two-design pilot and loaded custom counts remain visible in the
questionnaire; pilots do not establish a hit rate or experimental binding.
The review page states that this version does not provide seed-controlled
sampling replay. Historical requests and original outputs remain intact.
Before submission it also shows the actual modality, target-chain selection,
original structure downloads, generated/retained counts and CPU/memory budget.
Protein/peptide design shows the requested length range; scaffold-based
antibody/nanobody design shows the framework chain and selected design-position
count instead of presenting the unused free-length setting as an executed limit.

Binder candidate tables show the original native filter decision alongside scores,
including when sorting, searching, comparing or exporting rows. These decisions
come from the complete source-verified report mapped to exact candidate IDs;
shortlist membership and interface scores never substitute for a pass. Historical
results without that report remain explicitly unassessed. All candidates and
original rankings/files are retained; a native-filter pass is not experimental
binding validation.

REINVENT R-group design accepts one connected scaffold with single-bonded wildcard
attachment sites. An optional exact source-molecule reference is consumed by the
native adapter to validate the core, stereochemistry and declared sites before
sampling. Switching an explicitly selected starting molecule into R-group design
retains it for that check; fresh tasks remain empty. Output admission independently
rejects changes to protected atoms, hydrogen counts or undeclared attachment sites.
Raw sampling output and rejected structures remain downloadable. Chemical-core
validation does not fix 3D coordinates or establish affinity. SciPy is explicitly
locked because the upstream CLI imports its density estimator at startup.

OpenMM performs vacuum minimization, optionally retaining a precisely bound ligand.
Its potential energy includes the selected restraints and is not binding free energy.
The ligand must occupy the receptor frame; it is not silently docked. APBS's AMBER
protocol requires a prepared protein-only structure. PLIP contact distances are geometry,
not force or per-residue energy. Water-mediated contacts retain their actual water point.

Property training requires at least 50 distinct molecules and one selected numeric
endpoint. A best native model is separately run on the exported held-out scaffold split;
plots and metrics come from those predictions. Reuse requires the same target, units,
successful source task and checkpoint checksum. The relationship graph records the
training-task dependency instead of inventing another model registry.

The EGFR template contains 177 experimentally labeled molecules from ChEMBL assay
CHEMBL944276 (human recombinant EGFR, CHEMBL203). Its SDF preserves original activity
IDs, source hashes and the within-assay median replicate rule. The dataset has 59 Murcko
scaffolds. pIC50 is derived as 9 − log10(IC50 in nM). Data are CC-BY-SA-3.0; application
code is separately Apache-2.0. The data release contains no model predictions.

Previously published case bundles are accepted only through an explicit catalogue
fingerprint, unchanged historical sources and unchanged module revisions. Restoring
the old 45-module bundle does not certify results for the nine newly added tasks.
Template downloads use a fixed public input archive while retaining original RCSB/
ChEMBL source attribution, file sizes and checksums. A changed upstream formatting
header therefore does not replace historical coordinates or silently change a case.

## Deployment and acceptance

Components share the chosen managed installation directory. On this workstation, source,
environments, models, cache, outputs and case data remain on E: or the E-backed WSL volume.
Model assets are checksum-verified and mounted read-only; native execution has no network
access. Missing environments/resources block submission. Installed readiness is reported
separately from scientific acceptance on the target server.

The managed installer can reuse a complete local native image only when its program,
recipe, dependency lock, image-composition code and daemon platform all match. Cache
hits and source builds pass through the same offline, nonroot native CLI check before
publication in the installed registry. The explicit REINVENT CI study may retain the
admitted image in a short-lived, separately checksummed Actions artifact; importing
that cache does not install a component or validate a scientific result. The ordinary
deployment queue remains the sole installation authority.

The scientific upgrade workflow runs contract checks on pushes. Native CPU acceptance
is explicitly dispatched per changed program (`check=admet`, `openmm`, `chemprop`,
`apbs`, `plip` or `chemistry`); `all` is reserved for a deliberate complete adapter
acceptance run. This avoids repeatedly launching unrelated scientific programs for UI edits.

Focused contract/build/browser checks and remote native CPU checks do not replace GPU
validation. Boltz, BoltzGen, LigandMPNN/REINVENT campaigns and trained-model acceptance
must be evaluated on the intended server with actual inputs before being presented as
scientifically validated. A pinned result button is shown only for real retained evidence.

Source projects: [Boltz](https://github.com/jwohlwend/boltz),
[BoltzGen](https://github.com/HannesStark/boltzgen),
[REINVENT](https://github.com/MolecularAI/REINVENT4),
[LigandMPNN](https://github.com/dauparas/LigandMPNN),
[OpenMM](https://github.com/openmm/openmm),
[OpenFF](https://github.com/openforcefield/openff-toolkit),
[APBS](https://github.com/Electrostatics/apbs),
[PLIP](https://github.com/pharmai/plip),
[Chemprop](https://github.com/chemprop/chemprop).
