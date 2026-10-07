"""Isolated official-native baseline; not a platform task or scientific acceptance."""

import csv
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

root = Path("/tmp/deepternary")
root.mkdir()
(root / "deepternary").symlink_to("/opt/native/deepternary", target_is_directory=True)
for task, file in (("PROTAC", "protac.pth"), ("MGD", "glue.pth")):
    directory = root / "output/checkpoints" / task
    directory.mkdir(parents=True)
    (directory / "last_checkpoint").write_text("/models/" + file)
os.chdir(root)
case = Path("/inputs")
args = [
    sys.executable,
    "/opt/native/predict.py",
    "--task",
    "PROTAC",
    "--name",
    "5T35_H_E_759",
    "--lig",
    str(case / "ligand.pdb"),
    "--p1",
    str(case / "unbound_protein1.pdb"),
    "--p2",
    str(case / "unbound_protein2.pdb"),
    "--unbound-lig1",
    str(case / "unbound_lig1.pdb"),
    "--unbound-lig2",
    str(case / "unbound_lig2.pdb"),
    "--lig1-mask",
    str(case / "unbound_lig1.pdb"),
    "--lig2-mask",
    str(case / "unbound_lig2.pdb"),
    "--outdir",
    "/output/native",
    "--seeds",
    "2",
    "--device",
    "cpu",
]
with Path("/output/native.log").open("wb") as log:
    subprocess.run(args, check=True, stdout=log, stderr=subprocess.STDOUT, timeout=600)
summary = Path("/output/native/summary_5T35_H_E_759.csv")
with summary.open() as file:
    rows = list(csv.DictReader(file))
if len(rows) != 2:
    raise ValueError("The official baseline did not complete the bounded requested ensemble.")
artifacts = []
for row in rows:
    file = Path(row["complex_pred"])
    if file.parent != Path("/output/native") or not file.is_file():
        raise ValueError("Native output escaped its bounded directory.")
    atoms = [
        line for line in file.read_text().splitlines() if line.startswith(("ATOM  ", "HETATM"))
    ]
    if len(atoms) < 500:
        raise ValueError("The official ternary baseline did not retain complete components.")
    artifacts.append(
        {
            "name": file.name,
            "sha256": hashlib.sha256(file.read_bytes()).hexdigest(),
            "atoms": len(atoms),
        }
    )
Path("/output/protocol.json").write_text(
    json.dumps(
        {
            "native_entrypoint": "official_predict.py",
            "case": "5T35_H_E_759",
            "mechanism": "PROTAC",
            "device": "cpu",
            "requested": 2,
            "returned": len(rows),
            "artifacts": artifacts,
            "scope": "official_native_baseline_not_platform_adapter_or_prospective_validation",
        },
        indent=2,
    )
)
