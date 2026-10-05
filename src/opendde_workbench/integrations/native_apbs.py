"""Real PDB2PQR/APBS potential, with its calculated structure and physical conditions."""

import math
from importlib.metadata import version
from pathlib import Path

from native_io import execute, finish, input_file, metric


def pqr_positions(file):
    points = []
    for line in file.read_text().splitlines():
        if line.startswith(("ATOM", "HETATM")):
            parts = line.split()
            if len(parts) not in {10, 11}:
                raise ValueError("Native PQR has an unsupported atomic record.")
            points.append(tuple(float(value) for value in parts[-5:-2]))
            if not all(math.isfinite(float(v)) for v in parts[-5:]):
                raise ValueError("PQR contains nonfinite coordinates, charges or radii.")
    if not points or len(points) > 100000:
        raise ValueError("Choose a bounded structure with parameterized atoms.")
    return points


def run(request):
    source, _ = input_file(request, "structure")
    payload = request["payload"]
    lines = source.read_text(encoding="utf-8").splitlines()
    if any(
        line.startswith("HETATM") and line[17:20].strip() not in {"HOH", "WAT"} for line in lines
    ):
        raise ValueError(
            "Select a protein-only structure; this AMBER protocol does not parameterize ligands or cofactors."
        )
    pqr, prepared = Path("/output/charged-structure.pqr"), Path("/output/charged-structure.pdb")
    execute(
        [
            "pdb2pqr",
            "--ff=AMBER",
            "--keep-chain",
            "--drop-water",
            "--with-ph",
            payload["ph"],
            "--pdb-output",
            prepared,
            source,
            pqr,
        ]
    )
    points = pqr_positions(pqr)
    bounds = [
        (min(point[i] for point in points), max(point[i] for point in points)) for i in range(3)
    ]
    extent = [high - low for low, high in bounds]
    if max(extent) > 150:
        raise ValueError("This preview potential protocol supports structures up to 150 Å across.")
    grid = payload["grid"]
    salt = payload["salt_molar"]
    lines = [
        "read",
        f" mol pqr {pqr}",
        "end",
        "elec",
        " mg-auto",
        f" dime {grid} {grid} {grid}",
        " cglen " + " ".join(str(value + 40) for value in extent),
        " fglen " + " ".join(str(value + 20) for value in extent),
        " cgcent mol 1",
        " fgcent mol 1",
        " mol 1",
        " lpbe",
        " bcfl sdh",
        " pdie 2.0",
        " sdie 78.54",
        " chgm spl2",
        " srfm smol",
        " srad 1.4",
        " swin 0.3",
        " sdens 10.0",
        f" temp {payload['temperature_kelvin']}",
        f" ion charge 1 conc {salt} radius 2.0",
        f" ion charge -1 conc {salt} radius 2.0",
        " calcenergy total",
        " calcforce no",
        " write pot dx /output/electrostatic-potential",
        "end",
        "quit",
    ]
    config = Path("/output/apbs-input.in")
    config.write_text("\n".join(lines) + "\n")
    execute(["apbs", config], cwd="/output")
    produced = sorted(Path("/output").glob("electrostatic-potential*.dx"))
    if len(produced) != 1:
        raise ValueError("APBS did not produce a unique native potential grid.")
    if produced[0].name != "electrostatic-potential.dx":
        produced[0].rename("/output/electrostatic-potential.dx")
    metrics = [
        metric("pH", payload["ph"], "pH", "PDB2PQR/PROPKA condition", "descriptor"),
        metric("Ionic strength", salt, "mol/L", "APBS solvent condition", "descriptor"),
        metric("Temperature", payload["temperature_kelvin"], "K", "APBS condition", "descriptor"),
    ]
    finish(
        request,
        "APBS 3.4.1 / PDB2PQR " + version("pdb2pqr"),
        metrics=metrics,
        structure_artifact=prepared.name,
        potential_artifact="electrostatic-potential.dx",
        potential_unit="kBT/e",
    )
