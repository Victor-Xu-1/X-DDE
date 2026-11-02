"""Actual OpenMM force compilation and analytical energy checks; no MD steps."""

import hashlib
import importlib.util
import json
from pathlib import Path
from uuid import uuid4

import openmm
import pytest
from openmm import app, unit

ROOT = Path(__file__).resolve().parents[1] / "src/opendde_workbench/simulations"
spec = importlib.util.spec_from_file_location(
    "native_restraint_checks", ROOT / "native_restraints.py"
)
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)


@pytest.fixture
def fixture(tmp_path, monkeypatch):
    topology = app.Topology()
    chain = topology.addChain("A")
    residue = topology.addResidue("ALA", chain, id="8")
    for name in ("CA", "C"):
        topology.addAtom(name, app.element.carbon, residue)
    positions = [openmm.Vec3(0, 0, 0), openmm.Vec3(0.3, 0, 0)] * unit.nanometer
    modeller = app.Modeller(topology, positions)
    source = tmp_path / "source.pdb"
    with source.open("w") as stream:
        app.PDBFile.writeFile(topology, positions, stream, keepIds=True)
    reference = {
        "asset_id": str(uuid4()),
        "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "record": 0,
        "conformer": 0,
        "version_id": None,
    }

    def atom(name, x):
        return {
            "role": "structure",
            "source": reference,
            "chain": "A",
            "number": 8,
            "insertion": "",
            "atom": name,
            "index": None,
            "position_angstrom": [x, 0, 0],
        }

    request = {
        "inputs": [{"role": "structure", "source": reference}],
        "payload": {"kind": "openmm", "restraints": []},
    }
    original = native.Path
    monkeypatch.setattr(
        native,
        "Path",
        lambda value: (
            tmp_path / "restraints.json"
            if str(value) == "/output/restraints.json"
            else original(value)
        ),
    )
    return request, modeller, source, atom


def system():
    value = openmm.System()
    for _ in range(2):
        value.addParticle(12)
    return value


def energy(value, topology, positions):
    integrator = openmm.VerletIntegrator(0.001)
    context = openmm.Context(value, integrator, openmm.Platform.getPlatformByName("Reference"))
    context.setPositions(positions)
    result = (
        context.getState(getEnergy=True).getPotentialEnergy().value_in_unit(unit.kilojoule_per_mole)
    )
    del context, integrator
    return result


def test_position_force_keeps_angstrom_to_nm_units_and_nonperiodic_geometry(fixture):
    request, modeller, source, atom = fixture
    request["payload"]["restraints"] = [
        {"kind": "position", "atom": atom("CA", 0), "force_kj_mol_nm2": 1000}
    ]
    value = system()
    native.apply_restraints(request, modeller, value, source)
    assert energy(value, modeller.topology, modeller.positions) == pytest.approx(0)
    moved = [openmm.Vec3(3, 0, 0), openmm.Vec3(0.3, 0, 0)] * unit.nanometer
    assert energy(value, modeller.topology, moved) == pytest.approx(4500)
    receipt = json.loads((source.parent / "restraints.json").read_text())
    assert receipt["conditions"][0]["system_atom_indices"] == [0]
    assert receipt["force_constant_unit"] == "kJ mol^-1 nm^-2"
    restored = openmm.XmlSerializer.deserialize(openmm.XmlSerializer.serialize(value))
    assert energy(restored, modeller.topology, moved) == pytest.approx(4500)


def test_distance_force_is_applied_to_the_exact_selected_pair(fixture):
    request, modeller, source, atom = fixture
    request["payload"]["restraints"] = [
        {
            "kind": "distance",
            "first": atom("CA", 0),
            "second": atom("C", 3),
            "distance_angstrom": 2,
            "force_kj_mol_nm2": 1000,
        }
    ]
    value = system()
    native.apply_restraints(request, modeller, value, source)
    assert energy(value, modeller.topology, modeller.positions) == pytest.approx(5)


def test_wrong_model_or_source_coordinates_are_rejected_before_force_creation(fixture):
    request, modeller, source, atom = fixture
    selection = atom("CA", 9)
    request["payload"]["restraints"] = [
        {"kind": "position", "atom": selection, "force_kj_mol_nm2": 1000}
    ]
    with pytest.raises(ValueError, match="exact original atom/model"):
        native.apply_restraints(request, modeller, system(), source)


def test_absent_conditions_preserve_the_original_native_system(fixture):
    request, modeller, source, _ = fixture
    value = system()
    before = openmm.XmlSerializer.serialize(value)
    native.apply_restraints(request, modeller, value, source)
    assert openmm.XmlSerializer.serialize(value) == before
