"""Real RDKit parsing validates file/version handoffs on the remote CPU runner."""

import importlib.util
from pathlib import Path

import pytest

Chem = pytest.importorskip("rdkit.Chem")
source = Path(__file__).resolve().parents[1] / "src/opendde_workbench/native_task.py"
spec = importlib.util.spec_from_file_location("native_task", source)
native_task = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native_task)


def test_property_handoff_selects_one_real_sdf_record(tmp_path, monkeypatch):
    monkeypatch.syspath_prepend(str(Path(native_task.__file__).parent))
    monkeypatch.setattr(native_task, "OUTPUT", tmp_path)
    file = tmp_path / "library.sdf"
    with Chem.SDWriter(str(file)) as writer:
        writer.write(Chem.MolFromSmiles("CCO"))
        writer.write(Chem.MolFromSmiles("c1ccccc1"))
    ref = {
        "asset_id": "input",
        "record": 1,
        "conformer": 0,
        "version_id": "saved-version",
        "sha256": "a" * 64,
    }
    request = {"smiles": [], "ligand_files": ["input"], "scientific_inputs": [ref]}
    result = native_task.properties(request, {"input": str(file)})
    assert len(result["molecules"]) == 1
    molecule = result["molecules"][0]
    assert molecule["smiles"] == "c1ccccc1"
    assert molecule["scientific_reference"] == ref
    assert molecule["mw"] == pytest.approx(78.114, abs=0.01)
    request["scientific_inputs"] = []
    assert len(native_task.properties(request, {"input": str(file)})["molecules"]) == 2
    request["scientific_inputs"] = [{**ref, "record": 2}]
    with pytest.raises(ValueError, match="record is missing"):
        native_task.properties(request, {"input": str(file)})


def test_diffsbdd_atom_identity_uses_real_parser_and_exact_record(tmp_path):
    import hashlib

    from rdkit.Chem import AllChem

    source = Path(__file__).resolve().parents[1] / "src/opendde_workbench/diffsbdd/chemistry.py"
    spec = importlib.util.spec_from_file_location("xdde_chemistry", source)
    chemistry = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(chemistry)
    (tmp_path / "assets").mkdir()
    path = tmp_path / "assets/library.sdf"
    with Chem.SDWriter(str(path)) as writer:
        for smiles in ["CCO", "c1ccccc1"]:
            mol = Chem.AddHs(Chem.MolFromSmiles(smiles))
            assert AllChem.EmbedMolecule(mol, randomSeed=2026) == 0
            writer.write(mol)
    ref = {
        "asset_id": "input",
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "record": 1,
        "conformer": 0,
    }
    result = chemistry.inspect_identity(
        {"molecule": ref}, {"input": "/job/assets/library.sdf"}, tmp_path, tmp_path
    )
    assert result["reference"] == ref
    assert [a["index"] for a in result["atoms"]] == list(range(6))
    assert all(a["element"] == "C" and a["selectable"] for a in result["atoms"])
    normalized = Chem.SDMolSupplier(str(tmp_path / result["molecule_artifact"]))[0]
    assert Chem.MolToSmiles(normalized) == "c1ccccc1"
    ref["sha256"] = "a" * 64
    with pytest.raises(ValueError, match="digest changed"):
        chemistry.inspect_identity(
            {"molecule": ref}, {"input": "/job/assets/library.sdf"}, tmp_path, tmp_path
        )


def test_docking_native_atom_labels_must_match_the_real_chemical_graph(tmp_path):
    from types import SimpleNamespace

    from rdkit.Chem import AllChem

    source = Path(__file__).resolve().parents[1] / "src/opendde_workbench/docking/chemistry.py"
    spec = importlib.util.spec_from_file_location("docking_chemistry", source)
    chemistry = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(chemistry)
    molecule = Chem.AddHs(Chem.MolFromSmiles("CCO"))
    assert AllChem.EmbedMolecule(molecule, randomSeed=2026) == 0
    molecule = Chem.RemoveHs(molecule)
    for atom in molecule.GetAtoms():
        atom.SetAtomMapNum(atom.GetIdx() + 1)
    assert chemistry.chemical_mapping_matches(molecule, molecule, [0, 1, 2])
    assert not chemistry.chemical_mapping_matches(molecule, molecule, [2, 1, 0])
    output = tmp_path / "poses.sdf"
    molecule.SetProp("minimizedAffinity", "-5.2")
    molecule.SetProp("CNNscore", "0.0")
    with Chem.SDWriter(str(output)) as writer:
        writer.write(molecule)
    rows = chemistry.summarize_poses(
        output, molecule, SimpleNamespace(num_modes=1, cnn_scoring="none")
    )
    assert rows[0]["valid"]
    assert rows[0]["scores"] == [
        {"name": "minimizedAffinity", "value": -5.2, "unit": "kcal/mol", "direction": "lower"}
    ]
    assert rows[0]["source_to_pose_atoms"] == [0, 1, 2]
    molecule.SetProp("minimizedAffinity", "NaN")
    with Chem.SDWriter(str(output)) as writer:
        writer.write(molecule)
    assert not chemistry.summarize_poses(
        output, molecule, SimpleNamespace(num_modes=1, cnn_scoring="none")
    )[0]["valid"]

    output.write_text("")
    assert (
        chemistry.summarize_poses(
            output, molecule, SimpleNamespace(num_modes=1, cnn_scoring="none")
        )
        == []
    )


def test_atom_map_identifiers_do_not_create_false_stereochemical_changes():
    source = Path(__file__).resolve().parents[1] / "src/opendde_workbench/docking/chemistry.py"
    spec = importlib.util.spec_from_file_location("docking_stereochemistry", source)
    chemistry = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(chemistry)
    # Two identical methyl substituents differ only by bookkeeping map labels.
    labelled = Chem.MolFromSmiles("[CH3:1][C@H:2]([CH3:3])[CH2:4][OH:5]")
    assert chemistry.plain_smiles(labelled) == "CC(C)CO"
    first = Chem.MolFromSmiles("F[C@H](Cl)Br")
    second = Chem.MolFromSmiles("F[C@@H](Cl)Br")
    for mol in (first, second):
        for atom in mol.GetAtoms():
            atom.SetAtomMapNum(atom.GetIdx() + 1)
    assert chemistry.plain_smiles(first) != chemistry.plain_smiles(second)
    assert chemistry.plain_smiles(first) == Chem.MolToSmiles(
        Chem.MolFromSmiles("F[C@H](Cl)Br"), isomericSmiles=True
    )

    trans = Chem.MolFromSmiles("F/C=C/F")
    cis = Chem.MolFromSmiles("F/C=C" + chr(92) + "F")
    for mol in (trans, cis):
        for atom in mol.GetAtoms():
            atom.SetAtomMapNum(atom.GetIdx() + 1)
    assert chemistry.plain_smiles(trans) != chemistry.plain_smiles(cis)


def test_independent_bounds_use_real_heavy_atoms_and_retain_violations(tmp_path):
    from uuid import uuid4

    source = Path(__file__).resolve().parents[1] / "src/opendde_workbench/docking/bounds.py"
    spec = importlib.util.spec_from_file_location("bounds", source)
    bounds = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(bounds)
    mol = Chem.MolFromSmiles("CCO")
    conf = Chem.Conformer(mol.GetNumAtoms())
    conf.Set3D(True)
    for i, pos in enumerate(((0, 0, 0), (1, 0, 0), (6, 0, 0))):
        conf.SetAtomPosition(i, pos)
    mol.AddConformer(conf)
    file = tmp_path / "coordinates.sdf"
    with Chem.SDWriter(str(file)) as writer:
        writer.write(mol)
    parsed = Chem.SDMolSupplier(str(file), removeHs=True)[0]
    condition = {
        "id": str(uuid4()),
        "kind": "spatial_bounds",
        "selection": "all_heavy_atoms",
        "strength": "hard",
        "weight": None,
        "tolerance_angstrom": 0,
        "box": {"center": [0, 0, 0], "size": [4, 4, 4]},
    }
    check = bounds.assess(parsed, condition)
    assert not check["passed"] and check["checked_points"] == 3
    assert check["maximum_excess"] == 4
    assert check["violations"] == [
        {"output_atom_index": 2, "position": (6.0, 0.0, 0.0), "excess": (4.0, 0.0, 0.0)}
    ]
    centroid = {**condition, "selection": "heavy_atom_centroid"}
    assert bounds.assess(parsed, centroid)["violations"][0]["output_atom_index"] is None
    inside = {**centroid, "box": {"center": [2, 0, 0], "size": [4, 4, 4]}}
    assert bounds.assess(parsed, inside)["passed"]
    soft = {**condition, "strength": "soft", "weight": 2}
    rows = [{"record": 0, "valid": True}]
    bounds.verify_poses([parsed], rows, {"document": {"conditions": [soft]}})
    assert rows[0]["valid"] and rows[0]["constraint_checks"][0]["weighted_deviation"] == 8
    rows = [{"record": 0, "valid": True}]
    bounds.verify_poses([parsed], rows, {"document": {"conditions": [condition]}})
    assert not rows[0]["valid"] and "raw" in rows[0]["reason"]
    zero = {**condition, "box": {"center": [4, 0, 0], "size": [4, 4, 4]}}
    assert bounds.assess(parsed, zero)["violations"][0]["output_atom_index"] == 0
    parsed.GetConformer().SetAtomPosition(2, (2.0005, 0, 0))
    assert not bounds.assess(parsed, condition)["passed"]
    assert bounds.assess(parsed, {**condition, "tolerance_angstrom": 0.001})["passed"]
    parsed.GetConformer().Set3D(False)
    with pytest.raises(ValueError, match="three-dimensional"):
        bounds.assess(parsed, condition)
    parsed.GetConformer().Set3D(True)
    parsed.GetConformer().SetAtomPosition(0, (float("nan"), 0, 0))
    with pytest.raises(ValueError, match="nonfinite"):
        bounds.assess(parsed, condition)


def core_module(monkeypatch):
    folder = Path(__file__).resolve().parents[1] / "src/opendde_workbench/diffsbdd"
    monkeypatch.syspath_prepend(str(folder))
    import fixed_core

    return fixed_core


def core_molecule(smiles, points=None):
    from rdkit.Chem import AllChem

    mol = Chem.AddHs(Chem.MolFromSmiles(smiles))
    assert AllChem.EmbedMolecule(mol, randomSeed=2026) == 0
    mol = Chem.RemoveHs(mol)
    if points:
        for i, p in enumerate(points):
            mol.GetConformer().SetAtomPosition(i, p)
    return mol


def test_independent_core_reorders_atoms_and_rejects_identity_bond_or_coordinate_changes(
    monkeypatch,
):
    core = core_module(monkeypatch)
    source = core_molecule("CCO", [(0, 0, 0), (1.4, 0, 0), (2.8, 0, 0)])
    candidate = Chem.RenumberAtoms(source, [2, 0, 1])
    result = core.assess(source, candidate, [0, 1, 2])
    assert result["status"] == "passed"
    assert result["mapping"] == [
        {"source_atom": 0, "output_atom": 1},
        {"source_atom": 1, "output_atom": 2},
        {"source_atom": 2, "output_atom": 0},
    ]
    assert result["maximum_displacement"] == 0
    for change in ("element", "charge", "isotope", "bond", "extra_bond", "coordinates"):
        edited = Chem.RWMol(source)
        if change == "element":
            edited.GetAtomWithIdx(2).SetAtomicNum(7)
        elif change == "charge":
            edited.GetAtomWithIdx(2).SetFormalCharge(-1)
        elif change == "isotope":
            edited.GetAtomWithIdx(1).SetIsotope(13)
        elif change == "bond":
            edited.GetBondBetweenAtoms(0, 1).SetBondType(Chem.BondType.DOUBLE)
        elif change == "extra_bond":
            edited.AddBond(0, 2, Chem.BondType.SINGLE)
        else:
            edited.GetConformer().SetAtomPosition(2, (10, 0, 0))
        assert core.assess(source, edited, [0, 1, 2])["status"] == "failed", change
    changed_bond = Chem.RWMol(source)
    changed_bond.GetBondBetweenAtoms(0, 1).SetBondType(Chem.BondType.DOUBLE)
    atom_only = core.assess(source, changed_bond, [0, 1, 2], False)
    assert atom_only["status"] == "passed" and not atom_only["preserve_bonds"]


def test_core_ambiguity_budget_and_unusable_geometry_never_pass(monkeypatch):
    core = core_module(monkeypatch)
    source = core_molecule("CC", [(0, 0, 0), (0.2, 0, 0)])
    assert core.assess(source, source, [0], False)["reason"] == "ambiguous_core_mapping"
    assert (
        core.assess(source, source, [0], False, search_limit=1)["reason"]
        == "mapping_budget_exhausted"
    )
    for fixed in ([], [0, 0], [9], [-1]):
        with pytest.raises(ValueError, match="Fixed atoms"):
            core.assess(source, source, fixed)
    source.GetConformer().Set3D(False)
    with pytest.raises(ValueError, match="three-dimensional"):
        core.assess(source, source, [0])
    source.GetConformer().Set3D(True)
    source.GetConformer().SetAtomPosition(0, (float("nan"), 0, 0))
    with pytest.raises(ValueError, match="finite"):
        core.assess(source, source, [0])


def test_core_closed_tetrahedral_stereo_is_independent_of_atom_order(monkeypatch):
    core = core_module(monkeypatch)
    source = core_molecule("F[C@H](Cl)Br")
    indices = list(range(source.GetNumAtoms()))
    reordered = Chem.RenumberAtoms(source, list(reversed(indices)))
    assert core.assess(source, reordered, indices)["status"] == "passed"
    inverted = Chem.Mol(source)
    inverted.GetAtomWithIdx(1).InvertChirality()
    assert core.assess(source, inverted, indices)["reason"] == "stereochemistry_changed"
    assert core.assess(source, source, [1])["reason"] == "stereo_crosses_fixed_boundary"
    # Tiny coordinates isolate actual inversion from the native 0.5 A drift gate.
    conf = source.GetConformer()
    for i in indices:
        p = conf.GetAtomPosition(i)
        conf.SetAtomPosition(i, (p.x * 0.02, p.y * 0.02, p.z * 0.02))
    inverted = Chem.Mol(source)
    for i in indices:
        p = inverted.GetConformer().GetAtomPosition(i)
        inverted.GetConformer().SetAtomPosition(i, (-p.x, p.y, p.z))
    assert core.assess(source, inverted, indices)["reason"] == "stereo_geometry_inverted"


def test_core_double_bond_geometry_and_disconnected_regions(monkeypatch):
    core = core_module(monkeypatch)
    source = core_molecule("F/C=C/Cl")
    assert core.assess(source, source, [0, 1, 2, 3])["status"] == "passed"
    assert core.assess(source, source, [1, 2])["reason"] == "stereo_crosses_fixed_boundary"
    conf = source.GetConformer()
    for i in range(4):
        p = conf.GetAtomPosition(i)
        conf.SetAtomPosition(i, (p.x * 0.02, p.y * 0.02, p.z * 0.02))
    edited = Chem.Mol(source)
    # Reflect the defining substituent about the double-bond axis.
    import numpy as np

    points = core.coordinates(source)
    p, q, r = [np.array(points[i]) for i in (0, 1, 2)]
    axis = r - q
    projection = q + axis * np.dot(p - q, axis) / np.dot(axis, axis)
    edited.GetConformer().SetAtomPosition(0, tuple(2 * projection - p))
    assert core.assess(source, edited, [0, 1, 2, 3])["status"] != "passed"
    separated = core_molecule("CCO", [(0, 0, 0), (1.4, 0, 0), (2.8, 0, 0)])
    assert core.assess(separated, separated, [0, 2])["status"] == "passed"


def test_actual_sdf_core_qualification_keeps_rejected_raw_records(monkeypatch, tmp_path):
    core_module(monkeypatch)
    from verification import verify_inpaint

    source = core_molecule("CCO", [(0, 0, 0), (1.4, 0, 0), (2.8, 0, 0)])
    native = tmp_path / "native"
    native.mkdir()
    raw = native / "molecules.sdf"
    rejected = Chem.Mol(source)
    rejected.GetConformer().SetAtomPosition(2, (20, 0, 0))
    with Chem.SDWriter(str(raw)) as writer:
        writer.write(Chem.RenumberAtoms(source, [2, 0, 1]))
        writer.write(rejected)
    original = raw.read_bytes()
    ref = {"asset_id": "fixture", "sha256": "a" * 64, "record": 0, "conformer": 0}
    report = verify_inpaint(source, ref, [0, 1, 2], True, raw, tmp_path, 2)
    assert report["qualified_count"] == 1
    assert [c["status"] for c in report["candidates"]] == ["passed", "failed"]
    assert report["candidates"][0]["qualified_record"] == 0
    assert report["candidates"][1]["diagnostic_artifact"] == "diagnostic-core-002.sdf"
    assert raw.read_bytes() == original
    assert len(Chem.SDMolSupplier(str(tmp_path / report["qualified_artifact"]))) == 1
    assert len(Chem.SDMolSupplier(str(tmp_path / "diagnostic-core-002.sdf"))) == 1
    with pytest.raises(ValueError, match="count"):
        verify_inpaint(source, ref, [0, 1, 2], True, raw, tmp_path, 1)
