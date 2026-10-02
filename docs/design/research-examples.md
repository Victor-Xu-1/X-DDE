# Public research examples

Each current task module has one explicit entry in the source manifest at
`src/opendde_workbench/examples/catalogue.json`. The collection uses public
BRD4–JQ1, trastuzumab–HER2, ABL inhibitor, MZ1 ternary, RNA–TPP and
HER2 domain IV–Rb-H2 references. The campaign input example combines unchanged
native trastuzumab variable domains with the complete deposited 97-aa HER2
construct from 6LBX. Folding uses both complete 6LBX protein sequences (275 and
97 residues), rather than silently truncating a full-length protein.
Private Boltz projects and customer research data are not used as distributable
examples. Public experimental references, runnable inputs and calculated results
retain distinct identities.

`Load example` imports checksum-verified inputs into the existing immutable
AssetStore and ScientificStore. It preserves original files, creates traceable
FASTA or SDF collections where required, and pre-fills the module's questionnaire.
It does not submit a design calculation. Interactive atomic inspection uses the
existing native identity adapter. The user reviews the final page before
submitting a calculation.

Fixed native outcomes reference successful tasks in the same jobs database.
`example_pins` stores the request digest, bound environment-metadata digest and
every retained artifact digest. A fixed example cannot be replaced in place;
changing inputs, settings or results requires a new reviewed revision. A service
response that declares itself unavailable is not a calculated example. Missing
calculations are not replaced with synthetic scores. Fresh installations can
load inputs; viewing calculated outcomes requires retained native results or a
reviewed result bundle.

Compound examples point to existing immutable regions, research plans and pose
explorations through `example_record_pins`. Their successful native source tasks
and outputs are sealed with the same evidence checks as task examples. Viewing
a region restores its actual atom map and selectable colored regions. Viewing a
workflow or pose example selects its retained native run and outcomes. Loading
inputs creates a reviewable new questionnaire; it never re-launches the fixed
record. Campaign examples retain native input validation and explicitly state
that agent inference awaits the user's language-model configuration. Validation
is not presented as a completed design campaign.

Preview analysis and aligned display coordinates live in the job's `analysis`
directory. Native `output` is mounted read-only during analysis, so opening a
result cannot change the sealed native artifact inventory. Display caches use
schema 4; legacy schema-3 display caches are preserved during the verified local
migration, outside native output.

Preparation dependencies are explicit. The BRD4 receptor is selected from the
fixed Biopython preparation outcome; antibody variable domains come unchanged
from native ANARCII numbering. Whole-library property and ADMET examples retain
all three ABL inhibitors. Individual ChEMBL MOL responses receive SDF separators
only in the derived collection. Molecular records are not silently merged.

Proposal comparisons use native SolubleMPNN outputs. Their aggregate `loss` is
the mean per-chain negative log probability over designed residues, as declared
in the collection. It is not a binding measurement. The first-two subset and
complete four-proposal collection are identified as subsets of one actual batch.
Unmeasured parent fitness remains missing. Generated identifiers organize
retained native records; they do not invent additional design rounds.

MZ1 region labels identify atoms within 4.5 Å of BRD4 chain A or VHL chain D in
the original 5T35 coordinates. Membership may overlap. Atoms outside that
threshold remain a custom selection, rather than an invented linker or
pharmacophore assignment. The interaction example uses the complete apo 4LYI
receptor aligned to the JQ1-bound 3MXF frame and the original JQ1 pose. This is an
explicit pose hypothesis; it is not relabeled as an experimental apo binding
measurement or a repaired 3MXF crystal structure.

RCSB records retain CC0-1.0 attribution; ChEMBL records retain CC-BY-SA-3.0 terms.
The source manifest gives the exact public archive URL, byte size and SHA-256.
X-DDE's Apache-2.0 license covers its code. Upstream data and model terms are
preserved separately.

The `/api/examples` routes use the platform's existing mutation protection,
scientific storage and task authority. There is no separate scientific queue or
example file authority. Verification targets this feature, changed forms and
their direct consumers. Global regression/scientific suites are not required
or automatically triggered by this work.
