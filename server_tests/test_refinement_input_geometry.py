"""Real OpenMM/PDBFixer parsing and early rejection; never create a force context."""

import importlib.metadata
import importlib.util
import json
import sys
from pathlib import Path

import openmm
import pytest
from openmm import unit
from pdbfixer import PDBFixer

ROOT = Path(__file__).resolve().parents[1] / "src/opendde_workbench"
INPUTS = ROOT / "examples/stat6/inputs"


@pytest.fixture
def native(monkeypatch):
    modules = {}
    for name, relative in (
        ("native_io", "integrations/native_io.py"),
        ("receptor_native_io", "receptors/native_io.py"),
        ("native_structure", "integrations/native_structure.py"),
        ("native_md_input", "simulations/native_md_input.py"),
        ("native_openmm", "integrations/native_openmm.py"),
    ):
        spec = importlib.util.spec_from_file_location(name, ROOT / relative)
        module = importlib.util.module_from_spec(spec)
        monkeypatch.setitem(sys.modules, name, module)
        spec.loader.exec_module(module)
        modules[name] = module
    return modules


def test_observed_stat6_gaps_are_not_inferred_from_missing_seqres(native, monkeypatch):
    path = INPUTS / "STAT6-9BIG-observed-receptor.pdb"
    assert "SEQRES" not in path.read_text()
    fixer = PDBFixer(filename=str(path))
    fixer.findMissingResidues()
    assert not fixer.missingResidues
    assert openmm.__version__ == "8.6.1"
    assert importlib.metadata.version("pdbfixer") == "1.12.0"

    def no_repair_or_force_context(*args, **kwargs):
        pytest.fail("Reject observed discontinuities before repair or force-field construction")

    monkeypatch.setattr(PDBFixer, "addMissingAtoms", no_repair_or_force_context)
    monkeypatch.setattr(openmm.app, "ForceField", no_repair_or_force_context)
    adapter = native["native_openmm"]
    monkeypatch.setattr(adapter, "input_pdb", lambda request: (path, None))
    with pytest.raises(ValueError, match="peptide link.*chain A.*323 to 341"):
        adapter.run(
            {
                "operation": "structure_refine",
                "payload": {
                    "ph": 7.4,
                    "iterations": 1,
                    "restrain_backbone": True,
                    "restraint_kj_mol_nm2": 1000,
                },
                "options": {"device": "cpu", "cpu": 1, "seed": 2026},
                "inputs": [],
            }
        )


def test_continuous_predicted_reference_keeps_its_native_positions(native):
    fixer = PDBFixer(filename=str(INPUTS / "STAT6-AFv6-construct-113-658.pdb"))
    positions = fixer.positions.value_in_unit(unit.angstrom)
    original = [tuple(point) for point in positions]
    native["native_md_input"].validate_peptide_links(fixer.topology, positions)
    assert fixer.topology.getNumResidues() == 546
    assert fixer.topology.getNumAtoms() == 4306
    assert [tuple(point) for point in positions] == original


def test_explicit_native_chain_breaks_are_not_bridged(native, tmp_path):
    source = (INPUTS / "STAT6-AFv6-construct-113-658.pdb").read_text().splitlines()
    first = [row for row in source if row.startswith("ATOM  ") and int(row[22:26]) == 113]
    last = [row for row in source if row.startswith("ATOM  ") and int(row[22:26]) == 658]
    path = tmp_path / "explicit-fragments.pdb"
    path.write_text("\n".join([*first, "TER", *last, "TER", "END"]) + "\n")
    fixer = PDBFixer(filename=str(path))
    assert fixer.topology.getNumChains() == 2
    native["native_md_input"].validate_peptide_links(
        fixer.topology, fixer.positions.value_in_unit(unit.angstrom)
    )
    evidence = Path("server_tests/evidence/refinement-inputs")
    evidence.mkdir(parents=True, exist_ok=True)
    (evidence / "native-topology.json").write_text(
        json.dumps(
            {
                "openmm": openmm.__version__,
                "pdbfixer": importlib.metadata.version("pdbfixer"),
                "observed_gap_rejected_before_force_context": True,
                "continuous_predicted_reference_residues": 546,
                "explicit_chain_fragments_kept_separate": True,
                "minimization_dynamics_fep_executed": False,
            },
            indent=2,
        )
    )
