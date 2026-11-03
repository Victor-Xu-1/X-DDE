"""Controlled presentation fixture: real experimental coordinates, no model or promotion."""

import json
import shutil
from pathlib import Path
from uuid import uuid4

from opendde_workbench.models import Prediction, Status
from opendde_workbench.store import Store

INPUTS = Path("src/opendde_workbench/examples/stat6/inputs")


def case(state):
    sequence = "".join((INPUTS / "STAT6-human-P42226.fasta").read_text().splitlines()[1:])[516:632]
    store = Store(state / "jobs.sqlite3")
    job = store.create(
        Prediction(
            name="STAT6 · UI fixture (experimental reference, no prediction)",
            components=[{"kind": "protein", "value": sequence, "count": 1}],
        ),
        str(uuid4()),
        5,
        20,
    )
    assert store.claim(job.id) is not None
    output = state / "jobs" / job.id / "output"
    output.mkdir(parents=True)
    candidates = []
    for index in range(2):
        name = f"reference_sample_{index}.cif"
        shutil.copyfile(INPUTS / "9BIG.cif", output / name)
        # Synthetic matrices test chart selection and units, not a model's scientific output.
        matrix = [[float(abs(x - y) + index) for x in range(16)] for y in range(16)]
        confidence = {
            "token_pair_pae": matrix,
            "token_pair_pde": matrix,
            "contact_probs": [[1 / (1 + v) for v in row] for row in matrix],
            "atom_plddt": [(80 + index) / 100] * 16,
        }
        (output / f"reference_full_data_sample_{index}.json").write_text(json.dumps(confidence))
        candidates.append(
            {
                "id": f"seed-101-sample-{index}",
                "artifact": name,
                "atom_count": 16,
                "chains": ["A"],
                "ranking_score": 0.4 + index / 10,
                "plddt": 80 + index,
                "ptm": 0.6,
                "iptm": None,
                "has_clash": None,
                "rmsd_to_first": None,
                "contacts": [],
            }
        )
    analysis = state / "jobs" / job.id / "analysis"
    analysis.mkdir()
    (analysis / "workbench-analysis.json").write_text(
        json.dumps(
            {
                "schema_version": 4,
                "candidates": candidates,
                "ligands": [],
                "metric_notes": {
                    "fixture": "Presentation controls only; not scientific acceptance"
                },
            }
        )
    )
    store.finish(job.id, Status.SUCCEEDED)
    return job.id, sequence
