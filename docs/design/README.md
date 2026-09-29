# Design direction and capability contract

The owner-provided `reference.png` is retained unchanged as **visual style inspiration only**: light surfaces, restrained blue accents and readable scientific controls. It does not prescribe page layout, module names, example projects, metrics, plots or feature counts. The owner's latest clarification supersedes the earlier pixel-matching interpretation.

Image SHA-256: `0d65a4b5acde90c80469a4bcc013b623d43021bbf90a2b90e29452b59f10b842` (1448 × 1086).

## Product behavior

New prediction and structure results have separate work areas. A three-step form asks for the task, molecular inputs and a run preset. Guided mode is the default; Expert mode exposes all supported entity types, copy counts and numeric settings. Switching mode preserves edits. Workflow-specific drafts are retained while the page is open. Values are never stored in browser local storage; only the language preference is persisted.

Six workflows cover protein–ligand, protein, protein–protein, antibody–antigen, DNA/RNA and ligand-only structures. Antibody entry is shown only when ABAG is installed. Its default is ABAG; experts can explicitly choose the general model. These are existing-sequence co-folding tasks, not molecular/antibody design campaigns.

The installed input contract was audited against OpenDDE commit `ddfa1df8aff1babf1fddac4247b7d2351bd0ce9f`, particularly `docs/infer_json_format.md`, `docs/inference_instructions.md` and `runner/batch_inference.py` in the pinned external runtime. No upstream engine code is copied into this repository.

| Workbench function | Actual implementation |
| --- | --- |
| Protein, ligand, DNA, RNA, ions | Validated API maps to `proteinChain`, `ligand`, `dnaSequence`, `rnaSequence`, `ion` through the same persistent queue. |
| General / antibody–antigen | Existing OpenDDE / ABAG checkpoints; no separate inference runtime. |
| Presets / expert controls | Seed, samples, steps, cycles, precision and checkpoint selection; entity copies and combinations. |
| 3D display | Actual CIF parsing with 3Dmol; ribbons, green-carbon ligand ball-and-stick, side-chain lines, surface and conformer overlays. |
| Pocket neighborhood | Residues within a selected 3/4/5/6/8 Å distance of an existing ligand. This is not binding-site discovery. |
| Selection and display editing | Atom/residue picking, searchable residue list, focus, styles, hide/restore and two-atom distance measurement. Does not modify coordinates, chemistry or inference constraints. |
| Result interpretation | Native confidence, RDKit ligand descriptors, aligned RMSD, protein–ligand geometric contacts. Relevant panels only. |
| Projects / queue / exports | Local SQLite, supervised subprocesses, cancellation/retry, CIF/JSON/CSV/HTML. |

Removed from the product: image-derived reference project cards, four bundled PDB files, the reference loader/fetch script, duplicated shortcuts and obsolete styles. Affinity prediction, de novo molecular generation, optimization, benchmark claims and nonfunctional agent controls are absent.

Current adapter boundaries: no user-uploaded MSA/templates, file-based ligands, residue modifications or covalent-bond editor; no configured LLM agent. Some are upstream optional input features, but they are not exposed as working controls here. Model weights and runtime dependencies must be installed separately. No numerical UI result comes from the design image.

## Scientific display reference

The owner also supplied a molecular-viewer screenshot: emphasize the ligand, retain a soft ribbon context, show nearby residue side chains and offer direct selection. The workbench implements these interactions with its existing 3Dmol dependency. It does not bundle proprietary molecular-editor code, chemical preparation, minimization or docking features.

The code is MIT licensed. Owner-provided reference artwork and third-party marks are not relicensed by the code license.
