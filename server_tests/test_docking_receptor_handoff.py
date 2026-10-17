"""Actual 9BIG ARG578 conformers must survive the docking-to-quality boundary."""

import hashlib
import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1] / "src/opendde_workbench"
FIXTURE = Path(__file__).parent / "data/stat6-9big-arg578-altloc.pdb"


@pytest.fixture
def adapters(monkeypatch, tmp_path):
    monkeypatch.syspath_prepend(str(ROOT / "datasets"))

    def load(name, relative):
        spec = importlib.util.spec_from_file_location(name, ROOT / relative)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    docking = load("handoff_docking_receptor", "datasets/docking_receptor.py")
    quality = load("handoff_quality_inputs", "quality/native_inputs.py")
    monkeypatch.setattr(docking, "Path", lambda name: tmp_path / Path(name).name)
    return docking, quality


@pytest.mark.parametrize("policy", ["A", "B", "highest_occupancy"])
def test_selected_real_receptor_is_accepted_without_weakening_quality_checks(adapters, policy):
    docking, quality = adapters
    original = FIXTURE.read_bytes()
    with pytest.raises(ValueError, match="resolve alternate atom locations"):
        quality.receptor(original)
    output = docking.prepare(FIXTURE, alternate_locations=policy)
    prepared = output.read_bytes()
    quality.receptor(prepared)
    selected = "B" if policy == "B" else "A"
    expected = [
        line
        for line in original.decode().splitlines()
        if line.startswith("ATOM  ") and line[16] in {" ", selected}
    ]
    actual = [line for line in prepared.decode().splitlines() if line.startswith("ATOM  ")]
    assert len(actual) == len(expected) == 11
    assert all(line[16] == " " for line in actual)
    # Every identity, coordinate, occupancy and B factor is the selected observation.
    assert [(row[:16], row[17:]) for row in actual] == [(row[:16], row[17:]) for row in expected]
    receipt = json.loads(output.with_name("receptor-selection.json").read_text())
    assert receipt["source_sha256"] == hashlib.sha256(original).hexdigest()
    assert receipt["prepared_sha256"] == hashlib.sha256(prepared).hexdigest()
    assert receipt["alternate_location_policy"] == policy
    assert receipt["selected_residue_conformers"] == [
        {"chain": "A", "number": "578", "insertion": "", "alternate_location": selected}
    ]
    assert FIXTURE.read_bytes() == original


def test_unresolved_real_alternatives_still_require_explicit_selection(adapters):
    docking, quality = adapters
    with pytest.raises(ValueError, match="Confirm an alternate-location policy"):
        docking.prepare(FIXTURE)
    with pytest.raises(ValueError, match="resolve alternate atom locations"):
        quality.receptor(FIXTURE.read_bytes())
