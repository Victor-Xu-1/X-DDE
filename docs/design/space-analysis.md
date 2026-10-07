# Native structural-space analysis

This note describes the R41–R43 implementation under the canonical roadmap in
[README.md](README.md). The current v0.4.36 branch is a candidate; its new task is
registered as caver.paths through the existing task and deployment authorities.
Its questionnaire and result views are implemented. Full native, API and browser
acceptance must pass before publication.

CAVER 3.02 is the reviewed stable channel implementation. Its official archive is
fixed by SHA-256; its GPL-3.0 and bundled library notices stay with the separately
managed environment. X-DDE keeps the APIs, task queue, Worker/BackendRouter,
AssetStore, scientific versions and deployment authority.

Use the existing reference picker, residue/ligand 3D picker and one-step
questionnaire. A fresh file is the default. The user selects an observed ligand
or active-site residues and one of a few geometric-probe choices. Model selection
defaults to the single reviewed engine. Optional context/probe/budget settings
are folded. Do not present arbitrary commands, logs or construction documents.

The starting point is the equal-weight geometric center of the selected heavy
atoms. Selected genuine nonpolymer ligands can be removed from obstacles, while
protein/RNA/DNA residues remain protected. Preserve all other selected-context
obstacles and source identities. The same native task invokes shared structure preparation, resolving an explicit
alternate location (default A) and selected chains, retaining heterogens and
omitting water. Its actual prepared.cif becomes a new version in the original
structure family; missing atoms are not generated. Context obstacle maps and
computational PDB files remain diagnostics, rather than invented structural versions. Unknown or absent native van der Waals radii must fail clearly; the
upstream generic unknown-element radius is not an acceptable silent replacement.

An actual official-input counterexample changed channel count after common
translation (run 37587165372). Preserve this evidence. The adapter uses an
explicit proper rigid computational frame: source point at the origin, axes
from the first complete unambiguous protein N/CA/C residue. Record its anchor,
basis, inverse and export error bound. Original source assets are untouched;
all displayed channel coordinates are transformed back. No ligand-only fit,
reflection, hidden repair or world-fixed chemical-growth arrow is introduced.

Native configuration uses actual supported fields: starting_point_coordinates,
probe_radius, shell_radius, shell_depth, max_distance, desired_radius,
profile_tunnel_sampling_step, max_number_of_tunnels, and murtagh_matrix_size.
The candidate count and matrix budget are coupled. Record the requested and
optimized origins (native data/origins.pdb and data/v_origins.pdb). Retain the
declared finite search budget; no result means no path found under those
conditions, rather than proof that passage is impossible.

The complete-path length and bottleneck are native summary measurements.
CAVER's regular sampled length axis differs from the geometric polyline arc
length. Preserve both and validate full coverage against the native companion
characteristics CSV. Unknown radius error bounds remain unknown. Do not turn
native geometric throughput/cost into binding probability, affinity or energy.

The result presentation should pair an original-coordinate protein/ligand view
with a selectable channel overlay, width curve, bottleneck/length table and real
downloads. Only the selected channel needs its radius envelope; additional paths
can use quiet centerlines. Display original atoms as atoms, and channel geometry
as geometry. Preserve the visible protein and thin-ligand appearance policy.

Native protocol cases include the official 2ACE example and the actual
4EY7 human acetylcholinesterase–donepezil complex. The 4EY7 source has 794610 bytes,
SHA-256 6bca2109d7b512a576458c3261e597bb5159e8fb43162c5b6c88df71f9fcdbd2;
its chain-A E20:604 ligand contains 28 heavy atoms. A module-local fixed result
will use the existing case/pin/release mechanism after real computation and
cold/repeat restoration pass. It must not add personal task records.

Static tunnels and probe clearance do not establish passage of an entire linker
or second binding partner. Volume, attachment directions, constrained full
molecules and assemblies remain the corresponding roadmap work; do not mark
R41–R46 or all remaining plans complete from this channel task alone.

The native frame/protocol gate passed in run 37588562238: canonical reference,
common-translation and proper-quarter-rotation inputs each retained 50 paths and
identical measurements. The maximum PDB rounding error was 0.000827912 Å,
within the declared sqrt(3) × 0.0005 Å bound. Raw upstream inputs had 56 and 51
paths after translation; this counterexample is retained. The separate protein-only
4EY7 protocol probe had eight paths. The composed task retains its explicitly
selected additional obstacles, so its channel count is not fixed to eight.

The computational single-model export strips both MODEL and ENDMDL without
changing source files. An additional naming issue remained: CAVER derives snapshot
identity from filename digits, and a digit-free context.pdb was reported as
context.pdb0. The adapter therefore authors the explicit single snapshot
context_1.pdb and requires that exact identity in both native CSV reports.
The official manual defines snapshot prefix/number/suffix ordering:
https://caver.cz/fil/download/manual/caver_userguide.pdf
