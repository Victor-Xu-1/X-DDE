# X-DDE

[中文](README.md) · **English**

### Connect scientific tools into drug-discovery research you can build on.

X-DDE is an open-source visual research platform for early drug discovery.
Work with targets, structures and candidate molecules in one workspace:
prepare a task, choose a method, inspect the results, and carry the material into the next step.

For small molecules, antibodies, proteins and peptides, library screening and
DNA-encoded library (DEL) research, it helps researchers spend less time moving
files and switching tools, and more time asking: **What should we investigate next, and why?**

[Get started](#get-started) · [Research workflows](#from-a-research-question-to-the-next-step) · [Latest releases](https://github.com/Victor-Xu-1/X-DDE/releases) · [Apache-2.0](LICENSE)

![Actual X-DDE interface: BRD4–JQ1 structure results, candidate table and 3D pocket inspection](docs/images/structure-and-pocket.jpg)

*Native model output from the public BRD4–JQ1 case. Model confidence is not measured binding activity.*

## What X-DDE helps solve

Drug discovery has many excellent scientific tools. Bringing them together is often the difficult part.

- **Organize tools around research goals.** Start with a question such as predicting a structure, exploring binding poses or comparing candidates, and prepare the independent scientific environments you need
- **Turn one result into the next input.** Continue from structure to pocket, pocket to molecule, and candidate to properties or docking, selecting explicit materials and versions along the way
- **Make results readable and reviewable.** Link candidate tables to 2D molecules, 3D structures, sequences and plots; retain original materials and derived versions for comparison, download and review

X-DDE connects scientific software such as OpenDDE, Boltz-2, DiffSBDD and GNINA
through a shared research interface. Each retains its own methods, environment
and license, and performs the corresponding scientific calculation.

## From a research question to the next step

### Prepare a well-defined task

Choose a research goal, provide materials, select a method, then review and run.
Step-by-step forms focus on one question at a time. Recommended options help you
get started; expert mode retains control over methods and parameters. Public
research templates explain the inputs, while retained example results help you learn what to inspect.

![Actual guided task interface: choosing a research purpose and preparing BRD4–JQ1 inputs](docs/images/guided-task.jpg)

*An input template. Loading it does not start a calculation; submitting creates your own new task.*

### Explore targets, structures and potential binding sites

Gather target evidence, canonical sequences and public structures. Prepare or
predict proteins and complexes, then inspect candidate pockets, binding poses
and interactions. Select a candidate to examine its structure, compare poses,
and carry a confirmed receptor and pocket into molecule generation or screening.

Combine structure prediction, pocket finding, docking, rescoring and pose-quality
checks as needed. Model confidence, docking scores and geometric contacts have
different meanings; they do not directly establish measured affinity.

### Compare candidate molecules with their structures in view

Generate molecules around a pocket, explore analogues and local changes, prepare
chemical states and unbound conformers, then compare properties, structural alerts
and binding poses. Linked 2D structures, metrics and 3D molecules keep every row of numbers connected to a molecule.

![Actual candidate comparison: ABL inhibitors with 2D structures, predicted properties and a 3D molecule](docs/images/molecule-properties.jpg)

*Predicted endpoints retain their original names and units. Property and early-safety predictions support research screening and require experimental validation.*

### Continue from protein and antibody sequences to design and structure review

Inspect antibody numbering and CDRs, select variable positions, and carry out
antibody, protein or peptide design. Continue into sequence scoring, folding and
interface analysis. Reviewing sequences alongside structures helps compare
candidates and preserves the material behind each round of changes.

![Actual antibody-design template: trastuzumab–HER2 variable-domain sequences and CDR selection](docs/images/antibody-template.jpg)

*A validated design-input template, with no new antibody-design run. Experimental references, input materials and newly generated outputs remain distinct.*

### Shortlist a molecular library for deeper investigation

Import legitimately obtained supplier or in-house libraries, prepare structures
and indexes, retrieve candidates for a pocket, and use diversity selection to
narrow the set before independent docking. Library-member and supplier identifiers
stay with candidates so you can return to the source material.

![Actual pocket-conditioned screening: BRD4 candidate table and the selected molecule's 3D preview](docs/images/screening-candidates.jpg)

*A retrieval case using 177 public research molecules. The 3D view is an unbound conformer, not a binding pose or a large-library throughput benchmark.*

### Turn DEL reads into interpretable series and candidates

Connect library definitions, member structures and sequencing reads for decoding,
UMI/count analysis, enrichment and controls, and building-block series comparisons.
Review counts, replicates and structures together, then select candidates for
properties, docking or experimental follow-up.

![Actual DEL analysis: UNCDEL006–BRD4 member structures, target/control counts and enrichment](docs/images/del-enrichment.jpg)

*Native analysis of public experimental data. Counts and enrichment do not establish binding affinity; missing information remains unreported.*

### Go beyond a static pose with dynamics and free energy

Use OpenMM or GROMACS to investigate protein and complex dynamics, linking 3D
trajectories with RMSD, RMSF, radius of gyration and contact occupancy. For aligned,
same-charge analogues that meet the input requirements, use OpenFE to plan
perturbation networks and calculate relative binding free energies, reviewing
native uncertainties, sampling overlap and convergence diagnostics alongside the results.

![Actual interactive dynamics result: 3D trajectory playback linked to stability plots](docs/images/dynamics-interactive.png)

*Retained native short-simulation output for BRD4–JQ1. A short run can check the calculation pipeline; it does not establish adequate sampling or affinity accuracy.*

Induced-proximity workflows also support structural assembly hypotheses for
ternary complexes, degraders and other bifunctional molecules. These hypotheses
still require appropriate computational checks and experimental validation.

## Get started

Download the installer for your system from
[GitHub Releases](https://github.com/Victor-Xu-1/X-DDE/releases).
Release packages include the built frontend; you do not need Node.js or a frontend build.

**Windows PowerShell:** download `install.ps1`, then run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
X-DDE UI
```

**Linux / WSL:** download `install.sh`, run `bash install.sh`, follow the
installer's command-path instructions, then run `xdde dashboard`.

Open **Settings and help → Installation and runtime** and choose components,
models and data for your research. Execution depends on the required scientific
environments, resources and hardware; you do not need every optional component
to get started. See the [user guide](docs/user-guide.md) for detailed steps.

## Scope and responsible research

- **Research use.** Review sources, methods, inputs and uncertainty. Software checks, screenshots and short calculations do not establish scientific accuracy or clinical suitability
- **Defined scope.** RNA / DNA support focuses on structural inputs, complex prediction and feature preparation. General nucleic-acid drug design, synthesis routes, retrosynthesis and wet-lab automation are outside the current scope
- **Resources and data.** Some tasks need GPUs, substantial storage, models or external services. Supplier listings do not establish possession of full commercial libraries, live inventory or procurement authorization. Review data destinations and access permissions before use
- **Controlled access.** This is currently a single-user, loopback workbench. Use controlled access or an SSH tunnel on servers rather than publicly exposing an unauthenticated service

Interface images come from the running software using public research materials;
see [image sources and capture versions](docs/images/README.md).
Explore the [research cases](docs/design/research-examples.md),
[screening and DEL](docs/design/screening-and-del.md), and
[dynamics and free-energy guide](docs/simulations.md) for more detail.

## Open source and acknowledgments

Original X-DDE code is licensed under [Apache-2.0](LICENSE), with attribution in
[NOTICE](NOTICE). Integrated software, models, weights, data and outputs retain
their own terms, which may include GPL, attribution or noncommercial-research
conditions. For example, current official DrugCLIP weights, precomputed data and
model outputs use CC BY-NC 4.0; X-DDE's license does not expand those rights.

Thanks to upstream projects including OpenDDE, Boltz, DiffSBDD, GNINA, RDKit,
OpenMM, GROMACS, OpenFE, DrugCLIP, DELi, Mol* and Ketcher. Historical MIT releases
retain their distributed terms. The repository does not include private research
data, service secrets or upstream large model weights.
