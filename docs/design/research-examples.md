# Public research examples

Each current task module has one explicit entry in the source manifest at
`src/opendde_workbench/examples/catalogue.json`. The collection uses public
BRD4–JQ1, trastuzumab–HER2, ABL inhibitor, MZ1 ternary and RNA–TPP references.
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

RCSB records retain CC0-1.0 attribution; ChEMBL records retain CC-BY-SA-3.0 terms.
The source manifest gives the exact public archive URL, byte size and SHA-256.
X-DDE's Apache-2.0 license covers its code. Upstream data and model terms are
preserved separately.

The `/api/examples` routes use the platform's existing mutation protection,
scientific storage and task authority. There is no separate scientific queue or
example file authority. Verification targets this feature, changed forms and
their direct consumers. Global regression/scientific suites are not required
or automatically triggered by this work.
