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
| Interactions | PLIP 3.0.1 / Open Babel 3.2.1 | Classified protein–ligand contacts and original-coordinate annotations |
| Property modeling | Chemprop 2.3.1 | Scaffold-split regression, held-out plots and reusable native models |
| Structure editor | Mol* 5.13.0 | Integrated editor; the main preview continues using 3Dmol 2.5.5 |

The OpenMM environment uses RDKit 2025.09.6 because AmberTools 26.0 and that RDKit
conda build share Boost 1.86. The independent chemistry and ADMET environments use
RDKit 2026.03.6. OpenFF's base toolkit and Interchange base package provide the actual
SMIRNOFF/AM1-BCC flow; unrelated neural charge-model dependencies are not required by
this adapter. OpenMMForceFields 0.16.0 is installed from the checksum-verified official
source archive after its declared scientific dependencies. Dependency locks include
immutable conda artifact URLs/SHA-256 and pip hashes.

## Research inputs and results

New tasks start with fresh materials. Explicitly choosing a historical file or a module
template preserves its exact asset, record, conformer and checksum. PDB-only programs
can consume a CIF through a derived PDB with preserved author chain/residue identities;
unrepresentable identities are rejected. Original files are never overwritten.

Boltz's current adapter uses single-sequence mode for protein components. Ligand input
can be an explicitly selected SDF/MOL record or SMILES. Model affinity is not an
experimental binding measurement. BoltzGen antibody mode designs a selected variable
framework chain; it does not promise whole-IgG design. Its upstream pipeline controls
randomness; the UI does not expose an unsupported seed override.

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

## Deployment and acceptance

Components share the chosen managed installation directory. On this workstation, source,
environments, models, cache, outputs and case data remain on E: or the E-backed WSL volume.
Model assets are checksum-verified and mounted read-only; native execution has no network
access. Missing environments/resources block submission. Installed readiness is reported
separately from scientific acceptance on the target server.

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
