"""Register exact retained STAT6 inputs in isolated CI; no scientific calculations."""

import json
import os
from pathlib import Path
from uuid import uuid4

from opendde_workbench.assets import AssetStore
from opendde_workbench.examples.stat6.catalogue import verified_input
from opendde_workbench.examples.stat6.preparation import register_input
from opendde_workbench.research.contracts import VersionInput
from opendde_workbench.research.storage import ScientificStore
from opendde_workbench.settings import Settings
from opendde_workbench.store import Store

settings = Settings.from_env()
assert settings.state_dir.is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
store = Store(settings.state_dir / "jobs.sqlite3")
assets = AssetStore(store, settings.state_dir / "assets")
scientific = ScientificStore(store, assets)
objects = {
    key: register_input(scientific, key)
    for key in ("study_ligand", "study_protac", "stat6_receptor", "stat6_sequence")
}
canonical = verified_input("stat6_sequence")
sequence = "".join(canonical.decode().splitlines()[1:])
assert len(sequence) == 847
record_file = assets.save(
    "STAT6-sequence-selection.fasta",
    "sequences",
    canonical
    + b">STAT6 P42226 positions 601-847; display slice\n"
    + sequence[600:].encode()
    + b"\n",
)
objects["sequence_records"] = scientific.create(
    VersionInput(asset_id=record_file.id, kind="sequence", label="STAT6 sequence records"),
    uuid4(),
)
# A multi-record input joins two real source molecules without computing or
# altering coordinates. It is input-selection evidence, not a simulation result.
series = assets.save(
    "STAT6-input-series.sdf",
    "ligand",
    verified_input("study_ligand") + verified_input("study_protac"),
)
objects["series_second"] = scientific.create(
    VersionInput(
        asset_id=series.id, kind="molecule", label="STAT6 input series · PROTAC", record=1
    ),
    uuid4(),
)
root = Path("outputs/workspace-preview")
root.mkdir(parents=True, exist_ok=True)
(root / "cases.json").write_text(
    json.dumps({key: value.model_dump(mode="json") for key, value in objects.items()}, indent=2)
)
print("Registered retained STAT6 input previews; no task submitted.")
