"""Real OpenMM PDB parsing rejects unsafe FEP proteins without modifying inputs."""

import hashlib
import importlib
from pathlib import Path

import numpy as np
import pytest
from openmm import app, unit

from opendde_workbench.integrations.backend import ScientificBackend
from opendde_workbench.settings import Settings


@pytest.fixture
def reader(monkeypatch):
    root = Path(__file__).parents[1] / "src/opendde_workbench/simulations"
    monkeypatch.syspath_prepend(str(root))
    return importlib.import_module("native_fep_input").prepared_protein


def write_backbone(path, *, distance=1.33, split=False, missing=None, residue_name="ALA"):
    topology = app.Topology()
    chain = topology.addChain("A")
    coordinates = []
    for index, offset in enumerate((0.0, 2.90 + distance)):
        if index and split:
            chain = topology.addChain("A")
        residue = topology.addResidue(residue_name, chain, id=str(index + 1))
        for name, element, position in (
            ("N", app.element.nitrogen, offset),
            ("CA", app.element.carbon, offset + 1.45),
            ("C", app.element.carbon, offset + 2.90),
        ):
            if missing == (index, name):
                continue
            topology.addAtom(name, element, residue)
            coordinates.append((position, 0.0, 0.0))
    with path.open("w") as handle:
        app.PDBFile.writeFile(topology, coordinates * unit.angstrom, handle, keepIds=True)
    return path


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_real_pdb_coordinates_are_returned_in_angstrom_and_source_is_immutable(tmp_path, reader):
    source = write_backbone(tmp_path / "protein.pdb")
    before = digest(source)
    expected = np.asarray(app.PDBFile(str(source)).positions.value_in_unit(unit.angstrom))
    result = reader(source)
    assert result.shape == (6, 3)
    np.testing.assert_array_equal(result, expected)
    assert digest(source) == before


@pytest.mark.parametrize("distance", [0.5, 2.1, 20.0])
def test_actual_pdb_backbone_gaps_are_rejected_without_inventing_a_bond(
    tmp_path, reader, distance
):
    source = write_backbone(tmp_path / "broken.pdb", distance=distance)
    before = digest(source)
    with pytest.raises(ValueError, match="peptide link.*chain A.*1.*2"):
        reader(source)
    assert digest(source) == before


def test_ter_separated_fragments_with_same_chain_label_remain_separate(tmp_path, reader):
    source = write_backbone(tmp_path / "fragments.pdb", distance=20.0, split=True)
    before = digest(source)
    assert len(list(app.PDBFile(str(source)).topology.chains())) == 2
    assert reader(source).shape == (6, 3)
    assert digest(source) == before


def test_missing_backbone_is_not_silently_repaired_by_fep(tmp_path, reader):
    source = write_backbone(tmp_path / "missing.pdb", missing=(1, "N"))
    before = digest(source)
    with pytest.raises(ValueError, match="Incomplete protein backbone"):
        reader(source)
    assert digest(source) == before


def test_nonfinite_pdb_coordinates_are_rejected_before_mapping(tmp_path, reader):
    source = write_backbone(tmp_path / "invalid.pdb")
    lines = source.read_text().splitlines(keepends=True)
    index = next(i for i, line in enumerate(lines) if line.startswith("ATOM"))
    lines[index] = lines[index][:30] + "     nan" + lines[index][38:]
    source.write_text("".join(lines))
    before = digest(source)
    with pytest.raises(ValueError, match="protein coordinates are invalid"):
        reader(source)
    assert digest(source) == before


def test_unparameterized_residue_is_rejected_without_changing_original(tmp_path, reader):
    source = write_backbone(tmp_path / "cofactor.pdb", residue_name="LIG")
    before = digest(source)
    with pytest.raises(ValueError, match="cofactors/metals"):
        reader(source)
    assert digest(source) == before


def test_solvent_only_is_not_accepted_as_an_fep_receptor(tmp_path, reader):
    topology = app.Topology()
    residue = topology.addResidue("HOH", topology.addChain("W"))
    topology.addAtom("O", app.element.oxygen, residue)
    source = tmp_path / "water.pdb"
    with source.open("w") as handle:
        app.PDBFile.writeFile(topology, [(0, 0, 0)] * unit.angstrom, handle)
    before = digest(source)
    with pytest.raises(ValueError, match="not solvent alone"):
        reader(source)
    assert digest(source) == before


def test_water_near_an_unbound_ligand_cannot_establish_protein_frame(tmp_path, reader):
    source = write_backbone(tmp_path / "hydrated.pdb")
    protein = app.PDBFile(str(source))
    topology = protein.topology
    residue = topology.addResidue("HOH", topology.addChain("W"))
    topology.addAtom("O", app.element.oxygen, residue)
    positions = list(protein.positions.value_in_unit(unit.angstrom))
    positions.append((100.0, 0.0, 0.0))
    with source.open("w") as handle:
        app.PDBFile.writeFile(topology, positions * unit.angstrom, handle, keepIds=True)
    before = digest(source)
    frame = reader(source)
    assert frame.shape == (6, 3)
    ligand_position = np.asarray((100.0, 0.0, 0.0))
    assert np.linalg.norm(frame - ligand_position, axis=1).min() > 6
    assert app.PDBFile(str(source)).topology.getNumAtoms() == 7
    assert digest(source) == before


def test_native_fep_mounts_the_same_validation_authority_without_duplicate_files(tmp_path):
    settings = Settings(
        state_dir=tmp_path,
        image_file=tmp_path / "image",
        code_file=tmp_path / "code",
        model_dir=tmp_path / "models",
        cache_dir=tmp_path / "cache",
    )
    backend = ScientificBackend(settings, "openfe")
    root = Path(__file__).parents[1] / "src/opendde_workbench/simulations"
    for name in ("md_input", "fep_input"):
        file = "native_" + name + ".py"
        assert backend.shared_sources[file] == root / file
        assert file in backend.files
    assert len(backend.files) == len(set(backend.files)) <= 32
