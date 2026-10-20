# Generated molecular conformers

REINVENT produces chemical graph hypotheses. Its native sampling tables are
retained independently of the conformer qualification stage; these molecules
are neither receptor-conditioned poses nor experimental hits.

The existing `native_io.molecular_candidate` adapter delegates free-conformer
preparation to `integrations/native_generated_molecule.py`. It requires a single
connected, non-query molecule, deterministic single-thread ETKDGv3 embedding,
complete MMFF94s parameters, convergence within 1000 iterations, and finite
coordinates and energy. Failure rejects the task's candidate publication while
retaining native sampling files. It never substitutes 2D coordinates, accepts an
unconverged optimization, or silently drops an unqualified molecule.

The existing `chemistry/molfile_stereo.py` authority marks source-unknown stereo
explicitly for Molfile readback. It preserves known stereochemistry, isotopes,
and the declared graph without changing coordinates. A native SDF roundtrip must
retain the exact declared isomeric SMILES, including its uncertainty. It does
not resolve unspecified stereoisomers or establish a preferred bound pose.

SDF properties retain the seed, embedding and minimization methods, iteration
limit, native convergence return code, and finite unbound conformer energy. The
existing typed metric uses kcal/mol and `meaning=energy`. This force-field value
is not a binding affinity and must not rank unrelated compounds as better drugs.
No public result schema, queue, asset store, or environment authority is added.

The generated-conformer CI checks the actual managed RDKit version against the
observed STAT6 generation counterexample, mixed known/unknown stereochemistry,
alkenes and isotopes; it covers invalid graphs, failed embedding, unsupported
parameters, nonconvergence, nonfinite energy and staged native source files.
The existing stereo serializer and exact scaffold/attachment consumers are
included. Native research acceptance additionally requires the reviewed main
release on the unchanged localhost frontend, actual task submission, independent
chemical/output review and an explicit decision before fixing a template.

For saved ensembles, the pose-history download link includes the displayed
zero-based record on the existing asset URL. The asset endpoint extracts the
original record using the shared SDF framing utility, verifies the immutable
source digest, and retains coordinates, stereo and SD properties without
chemical reserialization. Downloads without a record still return the entire
unchanged original file. Bounds, empty/missing records and changed bytes fail
explicitly. The docking result can hand the selected saved pose and its matching
receptor directly to the existing PoseBusters questionnaire; coordinate-frame
confirmation remains required and opening the questionnaire runs no calculation.

The chosen 2D/3D view belongs to the preview workspace, independently of molecular
identity. Changing a candidate, protomer or conformer retains that choice while
the existing pose controller resets input selection/history to the new exact
source. Tabs remount for a new pose with only the chosen view visited; a hidden
3D preview must not initialize a newly selected molecule. Downloads and downstream
inputs still follow the selected scientific record, never the prior candidate.

Known SMILES first receive native stereochemical layout into a molecular
Molfile: exporting a coordinate-free chiral SMILES directly loses wedge bonds.
Native dearomatization with the generic aromaticity model assigns
alternating bonds before KET layout and hydrogen folding: an aromatic `[nH]`
implicit-H field can otherwise become a SMARTS query on a KET/editor roundtrip.
The generic model supports aromatic rings with external double bonds while
native dearomatization verification stays enabled. See the upstream
[Indigo aromaticity options](https://lifescience.opensource.epam.com/indigo/options/aromaticity.html).
This transformation applies only to a display copy. The original SMILES, SDF,
coordinates and user editor are immutable; failed native conversion is reported
instead of silently falling back to query import or editing SVG pixels. Focused
CI checks actual native Molfile graph identity, non-query atoms, retained donor
hydrogen and alternating aromatic bonds through the bilingual questionnaire.
