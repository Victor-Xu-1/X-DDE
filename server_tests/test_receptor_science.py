"""Real Biopython parsing, correspondence and rigid fitting in remote CPU CI."""

import hashlib
import importlib.util
import sys
from pathlib import Path
from urllib.request import urlopen
from uuid import uuid4

import pytest

pytest.importorskip("Bio")
np = pytest.importorskip("numpy")


@pytest.fixture
def native(monkeypatch):
    folder = Path(__file__).resolve().parents[1] / "src/opendde_workbench/receptors"
    monkeypatch.syspath_prepend(str(folder))
    modules = {}
    for name in ("selection", "native_io", "profiles", "correspondence", "native_fit", "runner"):
        spec = importlib.util.spec_from_file_location(name, folder / (name + ".py"))
        module = importlib.util.module_from_spec(spec)
        monkeypatch.setitem(sys.modules, name, module)
        spec.loader.exec_module(module)
        modules[name] = module
    return modules


@pytest.fixture
def source(tmp_path):
    # Public real structure; only the remote scientific job downloads this fixture.
    file = tmp_path / "1crn.pdb"
    with urlopen("https://files.rcsb.org/download/1CRN.pdb", timeout=30) as response:
        data = response.read(1024**2 + 1)
    assert 1000 < len(data) <= 1024**2 and b"ATOM" in data
    file.write_bytes(data)
    return file


def snapshot(native, source, tmp_path, mutation=None):
    from Bio.PDB import PDBIO, PDBParser

    folder = tmp_path / "assets"
    folder.mkdir()
    first = folder / "reference.pdb"
    first.write_bytes(source.read_bytes())
    model = PDBParser(PERMISSIVE=False, QUIET=True).get_structure("actual", str(source))[0].copy()
    rotation = np.array([[0, -1, 0], [1, 0, 0], [0, 0, 1]], dtype=float)
    for atom in model.get_atoms():
        atom.set_coord(atom.coord @ rotation + np.array([17, 23, -5]))
    if mutation:
        mutation(model)
    writer = PDBIO()
    writer.set_structure(model)
    second = folder / "moving.pdb"
    writer.save(str(second))
    refs = [
        {
            "asset_id": str(uuid4()),
            "sha256": hashlib.sha256(f.read_bytes()).hexdigest(),
            "record": 0,
            "conformer": 0,
            "version_id": None,
        }
        for f in (first, second)
    ]
    selection = native["selection"].MemberSelection().model_dump(mode="json")
    request = {
        "operation": "receptor_ensemble",
        "inputs": [{"structure": ref, "selection": dict(selection)} for ref in refs],
        "options": native["selection"].EnsembleOptions().model_dump(mode="json"),
    }
    bindings = {
        refs[0]["asset_id"]: "/job/assets/reference.pdb",
        refs[1]["asset_id"]: "/job/assets/moving.pdb",
    }
    output = tmp_path / "output"
    output.mkdir()
    return request, bindings, output


def test_actual_rigid_structure_copy_recovers_frame_and_original_residue_correspondence(
    native, source, tmp_path
):
    request, bindings, output = snapshot(native, source, tmp_path)
    result = native["runner"].run(request, bindings, tmp_path, output)
    assert result["qualified_count"] == 2 and result["collection_status"] == "aligned"
    row = result["members"][1]
    assert row["transformation"]["rmsd_angstrom"] < 0.003
    assert row["correspondence"]["pair_count"] == 46
    assert row["quality"]["backbone_complete"] and row["quality"]["source_profile"] == "unspecified"
    assert row["quality"]["bfactor_interpretation"] == "raw_bfactor_not_automatic_plddt"
    pairs = row["transformation"]["residue_pairs"]
    assert len(pairs) == 46 and pairs[0]["reference"]["number"] == 1
    for member in result["members"]:
        assert (
            hashlib.sha256((output / member["artifact"]).read_bytes()).hexdigest()
            == member["artifact_sha256"]
        )
    assert result["versions"] == {"biopython": "1.86", "numpy": "1.26.4"}
    import shutil

    fixture = Path("server_tests/evidence/core-fixture/receptor-inputs")
    fixture.mkdir(parents=True, exist_ok=True)
    for name in ("reference.pdb", "moving.pdb"):
        shutil.copyfile(tmp_path / "assets" / name, fixture / name)
    request["inputs"][1]["structure"]["sha256"] = "0" * 64
    with pytest.raises(ValueError, match="bytes differ"):
        native["runner"].run(request, bindings, tmp_path, output)


def test_incomplete_backbone_is_reported_and_excluded_without_fake_alignment(
    native, source, tmp_path
):
    request, bindings, output = snapshot(
        native, source, tmp_path, lambda model: model["A"][1].detach_child("N")
    )
    result = native["runner"].run(request, bindings, tmp_path, output)
    row = result["members"][1]
    assert result["qualified_count"] == 1 and result["collection_status"] == "partial"
    assert row["status"] == "rejected" and row["artifact"] is None and row["transformation"] is None
    assert not row["quality"]["backbone_complete"] and row["quality"]["incomplete_backbone"]
    request["options"]["require_complete_backbone"] = False
    assert (
        native["runner"].run(request, bindings, tmp_path, output)["members"][1]["status"]
        == "aligned"
    )


def test_real_homomer_ambiguity_requires_explicit_selected_chain(native, source, tmp_path):
    def duplicate(model):
        chain = model["A"].copy()
        chain.id = "B"
        model.add(chain)

    request, bindings, output = snapshot(native, source, tmp_path, duplicate)
    result = native["runner"].run(request, bindings, tmp_path, output)
    assert result["members"][1]["status"] == "rejected"
    assert "ambiguous" in result["members"][1]["reason"]
    request["inputs"][1]["selection"].update(
        chains=["B"], chain_pairs=[{"reference": "A", "moving": "B"}]
    )
    row = native["runner"].run(request, bindings, tmp_path, output)["members"][1]
    assert row["status"] == "aligned" and row["quality"]["selected_chains"] == ["B"]
    assert all(p["moving"]["chain"] == "B" for p in row["transformation"]["residue_pairs"])


def test_real_mmcif_parser_preserves_selected_model_and_author_chain_namespace(
    native, source, tmp_path
):
    from Bio.PDB import MMCIFIO, PDBParser

    model = PDBParser(PERMISSIVE=False, QUIET=True).get_structure("source", str(source))[0].copy()
    writer = MMCIFIO()
    writer.set_structure(model)
    file = tmp_path / "actual.cif"
    writer.save(str(file))
    selected = native["selection"].MemberSelection(chains=("A",))
    parsed, details = native["native_io"].read_model(file, selected)
    chains, quality = native["profiles"].profile(parsed)
    assert details["source_format"] == "mmcif" and details["selected_chains"] == ["A"]
    assert len(chains["A"]) == 46 and quality["backbone_complete"]


def test_non_rigid_difference_cannot_pass_the_declared_rmsd_gate(native, source, tmp_path):
    def deform(model):
        for residue in list(model["A"].get_residues())[:10]:
            for atom in residue.get_atoms():
                atom.set_coord(atom.coord + np.array([20, 0, 0]))

    request, bindings, output = snapshot(native, source, tmp_path, deform)
    result = native["runner"].run(request, bindings, tmp_path, output)
    assert result["members"][1]["status"] == "rejected"
    assert "RMSD" in result["members"][1]["reason"]
    assert result["members"][1]["artifact"] is None
