"""Remote-only actual numeric acceptance against analytics and independent FreeSASA."""

import hashlib
import json
import math
from pathlib import Path
from uuid import uuid4

import pytest

from opendde_workbench.receptors.surface_contract import SurfaceExposureTask
from opendde_workbench.receptors.surface_result import validate_surface

NATIVE = Path(__file__).resolve().parents[1] / "src/opendde_workbench/receptors"


@pytest.fixture
def native(monkeypatch):
    monkeypatch.syspath_prepend(str(NATIVE))
    from native_surface import run_surface

    return run_surface


def snapshot(tmp_path, raw):
    directory = tmp_path / "input"
    (directory / "assets").mkdir(parents=True)
    file = directory / "assets/input.pdb"
    file.write_bytes(raw)
    ref = {"asset_id": str(uuid4()), "sha256": hashlib.sha256(raw).hexdigest()}
    output = tmp_path / "output"
    output.mkdir()
    return directory, output, ref, {ref["asset_id"]: "/job/assets/input.pdb"}


def carbon(x, serial, number):
    return (
        f"HETATM{serial:5d}  C1  LIG A{number:4d}    "
        f"{x:8.3f}{0:8.3f}{0:8.3f}  1.00 20.00           C  \n"
    )


@pytest.mark.parametrize("occluder", [3.0, 20.0])
def test_analytic_sphere_caps_and_occlusion(native, tmp_path, occluder):
    raw = (carbon(0, 1, 1) + carbon(occluder, 2, 2) + carbon(40, 3, 3) + "END\n").encode()
    directory, output, ref, bindings = snapshot(tmp_path, raw)
    task = SurfaceExposureTask(
        structure=ref,
        scientific_inputs=[ref],
        regions=[{"chain": "A", "number": 1, "resname": "LIG"}],
    )
    report = native(task.model_dump(mode="json"), bindings, directory, output)
    result = validate_surface(report, task, output)
    radius = 1.7 + 1.4
    expected = (
        4 * math.pi * radius**2
        if occluder >= 2 * radius
        else 2 * math.pi * radius**2 + math.pi * radius * occluder
    )
    assert result.isolated_area == pytest.approx(4 * math.pi * radius**2, abs=1e-5)
    assert result.assembly_area == pytest.approx(expected, abs=1.0)
    assert result.buried_area >= 0


def prepared_public_case(tmp_path):
    raw = Path("server_tests/fixtures/surface-3mxf.pdb").read_bytes()
    assert (
        hashlib.sha256(raw).hexdigest()
        == "534dcb8ea9fa29956249b5133b22187c3867363b16a6b98dd8219c18c5d3250f"
    )
    directory, output, ref, bindings = snapshot(tmp_path, raw)
    from native_preparation import run_preparation

    from opendde_workbench.receptors.preparation_contract import StructurePrepareTask

    task = StructurePrepareTask(
        structure=ref,
        scientific_inputs=[ref],
        options={"alternate": "A", "waters": False, "heterogens": "keep", "format": "pdb"},
    )
    prepared = run_preparation(task.model_dump(mode="json"), bindings, directory, output)
    new = output / prepared["artifact"]
    (directory / "assets/prepared.pdb").write_bytes(new.read_bytes())
    ref = {"asset_id": str(uuid4()), "sha256": prepared["sha256"]}
    return directory, output, ref, {ref["asset_id"]: "/job/assets/prepared.pdb"}


def test_real_brd4_jq1_against_independent_lee_richards(native, tmp_path):
    import freesasa
    from Bio.PDB import PDBParser

    directory, output, ref, bindings = prepared_public_case(tmp_path)
    task = SurfaceExposureTask(
        structure=ref,
        scientific_inputs=[ref],
        regions=[{"chain": "A", "number": 1, "resname": "JQ1"}],
    )
    report = native(task.model_dump(mode="json"), bindings, directory, output)
    result = validate_surface(report, task, output)
    model = PDBParser(PERMISSIVE=False, QUIET=True).get_structure(
        "independent", str(directory / "assets/prepared.pdb")
    )[0]
    atoms = [
        a for a in model.get_atoms() if a.element not in {"H", "D"} and a.get_parent().id[0] != "W"
    ]
    selected = [i for i, a in enumerate(atoms) if a.get_parent().resname == "JQ1"]
    assert len(selected) == result.target_atoms and result.target_atoms > 25
    coordinates = [float(c) for a in atoms for c in a.coord]
    radii = [result.radii_angstrom[a.element] for a in atoms]
    conditions = freesasa.Parameters(
        {"algorithm": freesasa.LeeRichards, "probe-radius": 1.4, "n-slices": 100, "n-threads": 1}
    )
    independent = freesasa.calcCoord(coordinates, radii, conditions)
    exposed = sum(independent.atomArea(i) for i in selected)
    isolated = freesasa.calcCoord(
        [float(c) for i in selected for c in atoms[i].coord],
        [radii[i] for i in selected],
        conditions,
    ).totalArea()
    # Predeclared sampling tolerance: max(3 A^2, 3%) for this representative ligand.
    assert abs(result.assembly_area - exposed) <= max(3.0, 0.03 * exposed)
    assert abs(result.isolated_area - isolated) <= max(3.0, 0.03 * isolated)
    assert 0 < result.assembly_area < result.isolated_area
    evidence = Path("server_tests/evidence/surface")
    evidence.mkdir(parents=True, exist_ok=True)
    (evidence / "independent-comparison.json").write_text(
        json.dumps(
            {
                "source_pdb": "3MXF",
                "native_biopython": result.versions,
                "reference": "FreeSASA 2.2.1 Lee-Richards, 100 slices",
                "radii": "identical explicit elemental vdW",
                "probe_radius": 1.4,
                "biopython_exposed_area": result.assembly_area,
                "freesasa_exposed_area": exposed,
                "biopython_isolated_area": result.isolated_area,
                "freesasa_isolated_area": isolated,
                "tolerance": "max(3 A^2, 3%)",
                "scope": "representative_numeric_acceptance_not_linker_passage",
            },
            indent=2,
        )
    )


def test_ambiguous_coordinates_and_unknown_radii_fail_instead_of_guessing(native, tmp_path):
    raw = Path("server_tests/fixtures/surface-3mxf.pdb").read_bytes()
    directory, output, ref, bindings = snapshot(tmp_path, raw)
    task = SurfaceExposureTask(
        structure=ref,
        scientific_inputs=[ref],
        regions=[{"chain": "A", "number": 1, "resname": "JQ1"}],
    )
    with pytest.raises(ValueError, match="alternate"):
        native(task.model_dump(mode="json"), bindings, directory, output)
    from io import StringIO

    from Bio.PDB import PDBParser
    from native_surface import clean_context

    model = PDBParser(QUIET=True).get_structure(
        "unknown", StringIO(carbon(0, 1, 1) + carbon(20, 2, 2) + carbon(40, 3, 3))
    )[0]
    next(model.get_atoms()).element = "B"
    with pytest.raises(ValueError, match="Unreviewed element"):
        clean_context(model)
    next(model.get_atoms()).element = "C"
    list(model.get_atoms())[1].coord = list(model.get_atoms())[0].coord.copy()
    with pytest.raises(ValueError, match="Coincident"):
        clean_context(model)
