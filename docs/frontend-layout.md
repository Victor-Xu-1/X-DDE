# Task page layout

## Commercial workflow references and graphical results

The visual system uses a quiet neutral canvas, white research surfaces, restrained
green actions, readable typography and a single spacing/radius palette. Scientific
content determines layout: forms stay step-by-step; result tables sit beside the
selected molecular/sequence view; images are real native renderings.

Public product references were reviewed for interaction patterns, not for a claim
that X-DDE implements their proprietary scientific methods:

| Research workflow | Primary design references | X-DDE presentation |
| --- | --- | --- |
| Targets and reference import | Open Targets source evidence, Benchling record organization | Source status, separately tabbed associations/materials/activities, sortable evidence tables and exact sequence positions |
| Structures and input preparation | Boltz Lab task screens supplied by the owner, Maestro structure hierarchy | One question page, source-coordinate 3D context, confidence views and native PNG capture |
| Pockets, docking and contacts | Maestro ligand interactions, OpenEye VIDA spreadsheet/display linking | Exact pose/pocket selection, linked receptor view, original method/unit score columns and native 2D molecule thumbnails |
| Small molecule generation/state preparation | OpenEye VIDA compound browsing | Real per-record 2D/3D views, original record identity, qualified-candidate handoff and original state/force-field distinctions |
| Antibodies and sequence methods | Benchling AA sequence/alignment and annotation tools | Explicit source-position/CDR tracks, IMGT-preserving original/proposal alignment, native score tables and plots |
| Properties, safety and library inspection | Simulations Plus ADMET Predictor data/graph workflow | Searchable tables, raw endpoint values/units, selected molecular previews and interactive finite-value scatter plots |

Reference URLs:

- https://docs.eyesopen.com/applications/vida/spreadsheet.html
- https://docs.eyesopen.com/applications/vida/display_3d.html
- https://help.benchling.com/hc/en-us/articles/39922093033869-How-to-create-alignments
- https://www.schrodinger.com/platform/products/ligand-designer/
- https://www.simulations-plus.com/resource/admet-predictor-tutorial-series-calculating-properties/

ResearchTable changes view state only. Search/sort/pagination preserve native row
identities; missing values stay missing. Side-by-side comparisons never normalize
mixed metrics, convert scores into affinity or merge measured assay endpoints.
CSV exports retain source values and units, quote Unicode fields and guard
spreadsheet formulas. Tab panels mount on demand and preserve visited view state.

Candidate pockets use the shared sortable table with separate native ranks,
probabilities, scores and residue counts. Selecting a row highlights that exact
site in the source structure and carries its identity into the next task.

The shared native Ketcher SVG renderer reads exact bounded SMILES or MOL/SDF
records. One bounded readiness handshake, a serial drawing queue and a bounded
Blob cache keep cold starts and hidden panels from generating repeated requests.
Images load near the visible range. Bounded SVG data URLs preserve drawing bytes
and work under the unchanged platform image policy; unmounts release view state.
The pinned native color protocol uses normalized RGB, rather than the incompatible
hex example in the upstream high-level documentation. Native layout uses a
separate invisible drawing canvas and a display copy, so 3D source coordinates
are not projected into misleading flat chemical diagrams. It never changes the
user's editor or research files, and never creates research jobs.
Missing editors/invalid records remain explicit; retry is a user action.

3D capture uses the existing 3Dmol renderer and a same-origin frame/nonce check.
Only bounded PNG payloads are accepted. Captures show current display/camera state;
they do not represent a new structural calculation or a new evidence version.

Every molecular viewer uses the same online appearance controls. Native PNG
exports support bounded 1x/2x/3x rendering and restore the camera and viewport
even on errors. 2D drawings expose a few native line-weight choices and SVG
downloads. Metric charts export their displayed axes, values, labels and styles;
sequence views export exact FASTA. Originals retain separate download links.

Generated candidates are bound to the declared output digest, rather than an
asset's editable filename or the first page of global assets. State results
display every retained state and conformer independently of history indexing;
energy plots compare one state and force field only. Receptor ensembles open an
actual aligned pair by default. Sequence-design results use native score tables,
sequence comparisons and available declared structures; absent structures are
not fabricated. Historical RMSD results lacking an aligned export display
verified original inputs with an explicit distinction from aligned coordinates.

Every one of the 44 catalogue IDs remains in its original scientific execution
path. Shared typography/forms/structured result tables cover all module pages;
domain-specific views preserve native molecular records, source sequence positions,
score definitions, and readiness/qualification boundaries. No synthesis workflow
or unsupported scientific endpoint is added by this presentation update.

Portable public cases include source snapshots used by the native archive verifier.
Legacy bundles may recover the omitted final response only from the retained
archive material with the same recorded SHA-256; all existing source identity,
scope and digest checks still run. Missing metadata is never reconstructed from
molecular files, and changed existing receipts are never overwritten.

X-DDE uses one guided task component and one source-selection contract. Scientific engines and result schemas are unchanged by presentation work.

- Show one questionnaire step at a time. Keep Next and Submit at the lower right; validate the current step before navigation.
- Use a consistent 1040 px input surface and up to 1440 px for scientific results. The template toolbar, form and footer share that surface.
- Start with fresh files or pasted inputs. Historical files are an explicit choice; one selector includes exact scientific versions and unregistered uploads.
- Keep scientific inputs, units, coordinate-frame confirmations and external-service consent visible where needed. Optional adjustments, annotations and detailed result groups use disclosure controls.
- Present native metrics and compact result tables without treating model scores, geometric distances or contact counts as experimental binding or force.
- Namespace installation card styles. Avoid global form-button rules overriding task progress, tooltips or viewer controls.
- Asset lists precede the optional relationship graph. Creating a project opens a focused dialog.

## Scoped verification

`Task layout and browser checks` runs only the affected frontend contracts and a real Chromium sweep of all 44 research modules. It restores the reviewed public case bundle into fresh runner state; it does not launch scientific calculations. The sweep checks one visible step, aligned input surfaces, desktop/mobile overflow, archived example views and absence of new compute tasks. Screenshot and geometry evidence are uploaded as a workflow artifact.

A production UI update also needs visual review of its installed preview. Compiling source or passing DOM checks alone is not a visual acceptance result.

## Card and spacing contracts

Component installation uses one main card grid, bounded by the shared 1440 px workspace.
Columns use auto-fill at a 240 px minimum so a one- or two-item filter retains the same
card width. Cards have an explicit track width, a near-square proportion, readable
wrapping and a contained footer. Installed status is a compact disabled button;
repair, upgrades and removal remain in the separate maintenance disclosure. Selecting
a research group exposes its reviewed bundle, and optional models/support packages stay
expandable. Active or unresolved optional operations remain visible.

The capability catalogue, readiness cards and questionnaire choices share a consistent
card hierarchy and spacing. Tables, editors and scientific results keep their functional
layout rather than being forced into squares. A fresh prediction omits its empty project/
history toolbar. Asset pagination remains reachable with a bounded scrolling list.

Scoped browser checks inspect 1440/1920/2560 px desktops and a 390 px mobile viewport,
short component groups, optional models, footer containment and absence of installation
mutations. The existing 44-module questionnaire/expert/archived-result walk remains the
task-page acceptance boundary. These are interface checks, not scientific execution.

## Researcher-facing information

Every task page was reviewed as a research decision: identify the input, choose a plan, review the submission, interpret the native result, choose a next action. Default forms never expose internal server paths, queue reasons, job IDs, stack traces or transport envelopes. Exact scientific inputs, numerical units, missing/failed results, external-service consent, native methods and limitations remain accessible. Expert adjustments use the existing questionnaire, not another execution path.

Inputs have visible purpose labels; fresh entry remains the default. Empty history controls are omitted. Sequence scores retain input correspondence. Sequence proposals preserve full chains and genuine scores stored in scientific metadata; engineering receipts are excluded. Prepared prediction JSON is an explicitly generated scientific input with a download link, rather than an arbitrary internal JSON attachment.

Pocket selection highlights exact model/chain/number/insertion/alternate identities in the loaded source and reports actual matching counts. Docking opens the first qualified native pose. A zero-candidate result explains the outcome without trying to render an empty SDF. Generated candidate selection includes only the declared output artifact, not raw sampling or input assets. One immutable SDF-record extractor is shared by editor and viewer; it preserves blank headers and coordinates and refuses missing records.

Assets default to research results, with originals and tasks available through explicit filters and pagination. Installation shows main research tools first; optional models and supporting packages are expandable, with active/paused or unresolved failures exposed. Runtime descriptions state configuration/readiness truthfully and never equate configuration with scientific validation.

Focused CI checks exercise these result, identity, navigation, failure and component contracts. The Chromium sweep uses the frozen public research bundle and submits no scientific jobs; scientific-model acceptance is a separate server activity.


## Research navigation consolidation

One capability/view selection authority lives in App. The presentation registry assigns
all 44 visible catalogue IDs exactly once to six workflows; defaults and recommended
choices are checked against the backend-generated catalogue. Sidebar has nine destinations;
settings menu has three. Native task IDs, methods, scientific assets and example identities
remain unchanged. Scientific estimates are not merged or renamed into a different method.

Projects/files/editor share Research workspace. Actual results/exports share Tasks and
results and PredictionResults. Component installation/readiness share Installation and
runtime. Removed account and overview placeholders are not hidden behind another menu.
Navigation/Header, typed module mapping, task selection, task results and workspace tabs
have separate maintainable modules; duplicate UtilityViews routes are retired.

Change-specific CI verifies module coverage/defaults, one active navigation parent,
keyboard/outside-click/Escape behavior, fresh task inputs, explicit history, project scoping,
result loading/errors/exports, language/theme persistence, and the existing all-module
Chromium walk without submitting scientific tasks. Owner machine performs static/build,
real UI inspection and app lifecycle checks only.

Native candidate-set comparisons now pair numeric tables with selectable SVG bar charts. Recurring mutations retain both native denominators and missing improvement scores; no genealogy is drawn when the native result has no parent-child tree. Target MSA results show the original query sequence and native alignment depth, with FASTA and result JSON downloads; historical jobs without attached A3M files do not claim a portable alignment matrix.
