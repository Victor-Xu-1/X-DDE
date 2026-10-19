# Reference-conditioned protein comparisons

Status: implemented for v0.6.42, including the guided frontend, source-bound STAT6
inputs and interactive comparison views. Native geometry/export, actual API/queue/
asset controls and bilingual Chromium interaction checks passed on candidate
`0a398b03a478119d71fd4fa853b1b044768bd27a`
([focused native gate](https://github.com/Victor-Xu-1/X-DDE/actions/runs/39332656652)).
These calibration controls are not a pinned research study. Formal release,
installed runtime, managed structural-environment upgrade and real research
acceptance are separate delivery gates; the platform version alone proves none
of the later gates.

## Problem and ownership

The legacy `rmsd` task fits target C-alpha atoms and evaluates partner C-alpha atoms,
matching only chain and integer residue number. Its default STAT6 preset instead
selects two receptor-only constructs and supplies an empty partner list. Its result
has no aligned structural export. Insertion codes, chain remapping, coverage and
the fitted coordinate frame must become explicit rather than inferred.

Keep `rmsd` as the public capability identity. New requests will use the existing
X-DDE queue, immutable references, BackendRouter and managed structural environment.
Historical Harness requests and reports remain readable; their old scores are not
silently reinterpreted. Migrate the live entry only after native replacement checks.

## Scientific methods

1. Select exact reference/moving structural versions and model indices. Ask whether
   this compares functional conformations or validates a model against a reference.
2. Map target and partner chains explicitly, one-to-one with disjoint roles.
   Use sequence correspondence or explicitly reviewed author residue numbering.
   Preserve insertion codes and evaluated mutations, and report missing observations.
3. Fit the target with a proper rigid Biopython superposition; apply that same
   transform to the moving partner. Report target-fit and target-conditioned
   partner C-alpha RMSD separately, with their exact matched residue inventories.
4. Evaluate selected cross-role interfaces with pinned DockQ 2.1.3, retaining its
   native metrics and correspondence separately. DockQ's own backbone LRMSD is not
   relabeled as the user-target-conditioned C-alpha RMSD. Conformational comparison
   never labels a genuine alternative functional state an incorrect prediction.
5. Export source-preserving selections, aligned coordinates, transform, mapped
   per-residue displacement table, native report and missing-data evidence. Large
   left-hand overlay and right-hand analysis must share the same verified frame.

Biopython 1.88 is already managed. DockQ belongs in the same structural environment,
with locked runtime/build dependencies and a native gate, not a duplicate service.
Its standard file parser discards HETATM residues and only specially maps MSE/CME;
the wrapper must preserve source-annotated modified polymer residues such as PTR.
For PDB input, reject amino-acid-like HETATM observations without MODRES rather
than silently removing possible modified residues. Deposited mmCIF retains their
polymer membership without requiring this ambiguous conversion.
Do not silently omit phosphate atoms or rename their chemical identity. Verify all
selected polymer observations before native quality metrics can be accepted.

The stock small-molecule path does not provide this platform's stereochemistry
and bounded symmetry-mapping guarantees. Existing RDKit fixed-frame pose analysis
remains the authority for small molecules; do not advertise unsupported parity.

## Real STAT6 case

- Reference: deposited phosphorylated homodimer 4Y5U, author target A / partner B.
- Comparison: DNA-bound 4Y5W biological assembly 1, author target A / partner C.
  Assembly label chains A/H correspond to protein author chains A/C; the asymmetric
  unit also contains another dimer. Do not accidentally compare A/B across assemblies.
- Retain the complete deposited inputs. Analyze only the explicitly selected protein
  pair and describe DNA as the experimental context, not a simulated condition.
- Both states contain PTR641. 4Y5U has 445/438 observed C-alpha residues in A/B;
  4Y5W has 478/465 in A/C. Unresolved regions must remain absent, not reconstructed.
- This is a comparison of observed functional states, not a binding-affinity claim,
  model-accuracy benchmark or dynamics experiment. Submit the final real study only
  through the deployed latest-main frontend and review it before pinning.

## Gates and delivery

The reviewed real study is retained as immutable example revision 4 for `rmsd`
(task `0f2b0361-94af-4fe6-a4a8-62bbc80ca196`, calculated with v0.6.42).
Its explicit author-numbered mapping matches 441 target and 433 partner C-alpha
observations. Independent source-coordinate SVD reproduces 1.803036 A target-fit
RMSD and 23.740955 A partner RMSD in the same frame. Independent 5-A heavy-atom
contact counting reproduces 76 shared contacts out of 95 reference contacts;
the comparison has 81 contacts. These describe experimental functional-state
geometry, not failed prediction, affinity or activity. The whole-target fit also
differs from the source paper's SH2-domain alignment.

Data package 24 retains the case alongside the existing cohort: 43 STAT6 entries,
83 task records and 844 files, including one reported-data import that is distinct
from model inference. Cold and repeat restoration, exact input-version replay and
the new case's real result presenter were checked without starting scientific work.
The actual frontend was exercised in English and Chinese, including linked 3D/table/
plot selection, native structural downloads, a 3854x2176 PNG and an 89-mm SVG retaining
all 874 vector markers. Immutable originals and earlier case revisions remain intact.

Native checks must cover chain renaming, insertion codes, mutated/missing residues,
ambiguous mappings, proper rotations, known rigid controls, invalid source identities,
modified-polymer retention, source integrity and native report/export consistency.
Use only affected CI checks, then actual deployed browser submission, result review,
selection/overlay/download checks and immutable example replay. No MD/FEP execution.

Sources: [Biopython Superimposer](https://biopython.org/docs/1.88/api/Bio.PDB.Superimposer.html),
[DockQ](https://github.com/wallnerlab/DockQ),
[4Y5U](https://www.rcsb.org/structure/4Y5U),
[4Y5W](https://www.rcsb.org/structure/4Y5W).

Reviewed DockQ 2.1.3 source archive SHA256:
`50c4e2b4bced3bf865b12061ec0b56e23de1383dc70b445441848224f6c72c0d`.
