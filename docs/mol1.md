# Mol-1 structure prediction

Mol-1 is an additional X-DDE structure-prediction engine, selected before a task
starts. It uses the existing task API, BackendRouter/Worker, immutable assets,
deployment queue and native result manifest. OpenDDE is not required to execute it.
The default engine for existing tasks does not change.

## Guided use

1. Provide protein, DNA, RNA, ligand or ion components. Optional copies, chain IDs
   and modifications use the shared molecular input editor. File ligands retain
   their original record, 3D coordinates and chemical graph.
2. Choose searched MSAs, supplied A3M files or an explicit single-sequence run.
   Remote sequence search requires permission. Supplied A3M queries must match
   the actual component sequence. Optional template-hit A3M/HHR files require
   network permission to retrieve structures; embedded native JSON templates
   support offline use. RNA MSAs require supplied A3M files: the released resource
   archives do not include the large external RNA search databases.
3. Choose sample count, recycling cycles and diffusion steps. Advanced controls
   retain distinct model seeds, numerical precision, TF32, operator fusion,
   diffusion cache mode, attention/MSA/sample chunking and paired-as-unpaired MSA
   behavior. CPU/GPU selection and resource limits pass to the shared runner.
4. Review and submit. Results retain each native seed and rank, original CIF,
   native summary/full confidence JSON and downloadable artifacts. Interactive
   plots show atom pLDDT and token PAE, PDE and predicted contact probability.

Whole-structure pLDDT uses 0–100; native atom pLDDT uses 0–1 and is explicitly
converted to 0–100 for its plot. Token indices are not residue identifiers.
Large full confidence files remain downloadable; previews use declared sampling
strides and keep the exact original file's SHA-256 identity. Confidence is not
experimental binding affinity. Within-seed ranks are not a new cross-seed score.

## Published capability boundary

| Native ability | X-DDE access |
| --- | --- |
| Base-model multi-entity prediction | Typed `mol1_predict` operation and guided form |
| Modifications, copies, explicit covalent connectivity | Shared entity contract and optional bond editor; file-ligand atoms can be selected in 3D |
| Protein MSA and template preparation used by prediction | Native prediction pipeline, with explicit network/file controls |
| RNA evolutionary features | Supplied RNA MSA; external database search is not enabled |
| Native structures and confidence | Original files, candidate table, 3D viewer, interactive atom/token plots and downloads |
| Environment diagnosis | Managed installation verifies native CLI startup; task errors retain server-side diagnostics |
| Standalone `mol json`, `mol msa`, `mol prep`, fine-tuning scripts | Not separate task operations in this change; do not present them as implemented standalone workflows |
| Mol-1-constraint geometric conditioning | Not available: that model variant has not been publicly released |

Known covalent connectivity is not a geometric distance restraint. OpenMM has a
separate supported 3D harmonic-restraint editor; see [simulation use](simulations.md).
The pinned Mol-1 native profile uses Torch triangle/LayerNorm kernels. Alternative
CUDA extension profiles are not claimed to be verified by this integration.

Prediction calls the pinned public `inference_jsons` API used by `mol pred`; the
GUI's paired-MSA setting passes through that API's configuration map. It is not
sent as an unsupported CLI option. Native preprocessing operates on a verified
task-owned writable copy, while the submitted specification and scientific files
remain read-only. File-ligand covalent selections are translated from original
atom indices to actual native atom names after checking graph, atom and coordinate
correspondence, including hydrogen removal and SDF atom maps. SMILES connections
require explicit unique heavy-atom map numbers; CCD connections use atom names.

## Provenance, installation and verification

The source is pinned to `molence/Mol-1` commit
`e6e64866ee89640a91cef7ee777a85f1d8be03bb`. Source archive, model weights and both
reference archives have immutable hashes in the canonical scientific recipe.
The isolated environment uses its hash-locked Python dependency file and HMMER /
Kalign system dependencies. Existing environments are not reinstalled or renamed.
Source Apache-2.0 terms, upstream notices, model distribution and wwPDB data terms
remain separate from X-DDE's own license; see the
[upstream documentation](https://github.com/molence/Mol-1).

The Mol-1/3D-condition workflow limits automatic checks to the changed contracts,
forms and direct consumers. Explicit native CI builds this actual profile and
submits one bounded CPU engineering prediction through the compiled frontend.
That check does not establish STAT6 accuracy or promote a research template.
Installation, native verification and scientific acceptance are separate states.
The integration must remain a candidate until its applicable native/browser
checks and independent review succeed.

Owner data, tasks and existing model installations are preserved. Release rollback
uses the previous reviewed X-DDE wheel and installed recipe identities. The owner
service address remains `http://127.0.0.1:4322/`.
