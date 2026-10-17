# STAT6 refinement input boundary

The supplied experimental 9BIG receptor is an observed structure with unresolved
internal segments. Its ATOM-only PDB has no SEQRES sequence. OpenMM 8.6.1 and
PDBFixer 1.12.0 parse 409 residues and infer no missing residues, while the native
topology contains these long peptide links:

| Observed residues | Native C–N distance |
| --- | ---: |
| A323 → A341 | 20.4716 Å |
| A365 → A381 | 18.1789 Å |
| A394 → A400 | 6.1368 Å |

Sequence-only preparation checks cannot establish peptide continuity for this
input. Refinement now uses the same observed-backbone validator as the dynamics
preparer, before missing-atom repair and again afterward. It checks actual C–N
geometry within explicit chains, accepts valid links despite author-numbering
jumps, and preserves explicit chain boundaries. It does not reconstruct missing
sequence or invent a connecting bond.

The refinement template uses the existing, checksum-verified AlphaFold v6 STAT6
113–658 construct. Native parsing confirms its 546 residues and 4,306 atoms form
continuous observed peptide links. Its input coordinates remain unchanged when
selected. The case title, source files and guidance identify it as a predicted
reference rather than an experimental bound structure. Other experimental
reference uses retain their own documented inputs.

The default task retains backbone restraints, pH 7.4, a 500-iteration limit,
CPU 2, 2,048 MiB and seed 2026. It is a bounded preparation in vacuum. Reported
potential energies include the selected positional-restraint contribution;
they do not measure binding affinity or binding free energy. The isolated
construct and protonation choices are model assumptions, not experimental
validation or restoration of the missing crystallographic loops.

Focused native checks parse the real experimental and predicted files through
OpenMM/PDBFixer, exercise rejection through the actual refinement adapter, and
retain explicit chain breaks. These input checks create no force-field context
and run no minimization, dynamics or FEP. A real refinement result is reviewed
separately after submitting it through the released frontend.
