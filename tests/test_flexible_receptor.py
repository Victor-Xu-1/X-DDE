"""Exact residue identity and paired native output, independent of GNINA scores."""

import hashlib
from copy import deepcopy
from uuid import uuid4

import pytest
from pydantic import ValidationError

from opendde_workbench.docking.contract import DockingTask
from opendde_workbench.docking.flexible_contract import FlexibleReceptor
from opendde_workbench.docking.flexible_receptor import normalize, validate_selection, verify_pair
from opendde_workbench.docking.receptor_atoms import parse_atoms


def line(serial, name, resn, chain, number, position, element, record="ATOM"):
    return (
        f"{record:6}{serial:5d} {name:>4} {resn:3} {chain}{number:4d}    "
        + "".join(f"{v:8.3f}" for v in position)
        + f"{1:6.2f}{20:6.2f}          {element:>2}  \n"
    ).encode()


def protein():
    atoms = [
        ("N", (0, 0, 0), "N"),
        ("CA", (1.45, 0, 0), "C"),
        ("C", (2, 1.4, 0), "C"),
        ("O", (3.23, 1.4, 0), "O"),
        ("CB", (1.4, -1.2, 0.9), "C"),
        ("OG", (2, -2.3, 0.9), "O"),
    ]
    return (
        b"REMARK Unit identity fixture; not a scientific example\n"
        + b"".join(
            line(i + 1, name, "SER", "A", 1, xyz, element)
            for i, (name, xyz, element) in enumerate(atoms)
        )
        + line(7, "ZN", "ZN", "Z", 9, (20, 20, 20), "ZN", "HETATM")
        + b"END\n"
    )


def moved(source, atom="OG", shift=0.02):
    lines = source.splitlines(keepends=True)
    for i, item in enumerate(lines):
        if item[:6] in (b"ATOM  ", b"HETATM") and item[12:16].strip() == atom.encode():
            x = float(item[30:38]) + shift
            lines[i] = item[:30] + f"{x:8.3f}".encode() + item[38:]
    return b"".join(lines)


def task():
    receptor = {"asset_id": str(uuid4()), "sha256": "a" * 64}
    return {
        "name": "Existing pose",
        "mode": "minimize",
        "receptor": receptor,
        "ligand": {"asset_id": str(uuid4()), "sha256": "b" * 64},
        "pose_frame": receptor,
        "pose_coordinate_basis": "user_confirmed",
    }


def test_explicit_minimize_only_contract_and_legacy_serialization():
    old = DockingTask.model_validate(task()).model_dump(mode="json")
    assert "flexible_receptor" not in old
    value = task()
    value["flexible_receptor"] = {"residues": [{"chain": "A", "number": 1}]}
    request = DockingTask.model_validate(value)
    assert request.flexible_receptor.tokens == ["A:1"]
    for mode in ("score", "dock"):
        bad = deepcopy(value)
        bad["mode"] = mode
        with pytest.raises(ValidationError, match="minimiz"):
            DockingTask.model_validate(bad)
    for residues in (
        [],
        [{"chain": "AA", "number": 1}],
        [{"chain": "A", "number": True}],
        [{"chain": "A", "number": 1}] * 2,
        [{"chain": "A", "number": i} for i in range(9)],
        [{"chain": "A", "number": 1, "insertion_code": "AB"}],
    ):
        with pytest.raises(ValidationError):
            FlexibleReceptor(residues=residues)


def test_normalization_retains_source_identity_context_and_the_actual_pair(tmp_path):
    source = protein()
    native = moved(source)
    ligand = b"real ligand bytes are hashed, not interpreted by this PDB validator"
    output, receipt = normalize(source, native, ["A:1"], "Flexible residues: A:1\n", ligand)
    assert output == native
    assert receipt["moved_sidechain_atoms"] == 1
    assert receipt["maximum_sidechain_displacement_angstrom"] == pytest.approx(0.02)
    assert receipt["native_backbone_max_displacement_angstrom"] == 0
    assert receipt["original_receptor_sha256"] == hashlib.sha256(source).hexdigest()
    assert receipt["raw_ligand_sha256"] == hashlib.sha256(ligand).hexdigest()
    assert receipt["checked_bonds"] == 5
    assert receipt["checked_centers"] == 1
    for name, raw in (
        ("input-receptor.pdb", source),
        ("native-flex-receptor.pdb", native),
        ("receptor.pdb", output),
        ("poses.sdf", ligand),
        ("native.log", b"Flexible residues: A:1\n"),
    ):
        (tmp_path / name).write_bytes(raw)
    verify_pair(tmp_path, receipt["original_receptor_sha256"], ["A:1"], receipt)
    (tmp_path / "poses.sdf").write_bytes(ligand + b"tampered")
    with pytest.raises(ValueError, match="pair"):
        verify_pair(tmp_path, receipt["original_receptor_sha256"], ["A:1"], receipt)


@pytest.mark.parametrize("atom", ["N", "CA", "C", "O", "ZN"])
def test_a_better_score_cannot_excuse_moved_backbone_or_cofactor(atom):
    with pytest.raises(ValueError, match="fixed|backbone"):
        normalize(protein(), moved(protein(), atom), ["A:1"], "Flexible residues: A:1\n", b"ligand")


@pytest.mark.parametrize(
    "alter",
    [
        lambda raw: raw.replace(b"SER A", b"THR A"),
        lambda raw: b"".join(
            item for item in raw.splitlines(keepends=True) if item[12:16].strip() != b"ZN"
        ),
        lambda raw: raw + raw.splitlines(keepends=True)[1],
    ],
)
def test_native_renaming_missing_context_and_duplicate_atom_identity_fail_closed(alter):
    with pytest.raises(ValueError):
        normalize(protein(), alter(protein()), ["A:1"], "Flexible residues: A:1\n", b"ligand")


def test_missing_incomplete_or_metal_adjacent_selection_is_not_silently_ignored():
    atoms = parse_atoms(protein(), reject_hydrogens=True)
    with pytest.raises(ValueError, match="residue"):
        validate_selection(atoms, ["A:2"])
    incomplete = b"".join(
        item for item in protein().splitlines(keepends=True) if item[12:16].strip() != b"OG"
    )
    with pytest.raises(ValueError, match="complete"):
        validate_selection(parse_atoms(incomplete), ["A:1"])
    near_metal = protein().replace(b"  20.000  20.000  20.000", b"   2.000  -2.600   2.000")
    with pytest.raises(ValueError, match="metal"):
        validate_selection(parse_atoms(near_metal), ["A:1"])
    for log in (
        "",
        "Flexible residues: A:2\n",
        "Flexible residues: A:1\n" * 2,
        "Flexible residues: A:1\nWARNING: Only identified 0 of 1 requested flexible residues.\n",
    ):
        with pytest.raises(ValueError, match="selection"):
            normalize(protein(), protein(), ["A:1"], log, b"ligand")


def test_stretched_bonds_and_reflected_alpha_center_are_rejected():
    with pytest.raises(ValueError, match="covalent"):
        normalize(
            protein(), moved(protein(), "OG", 5), ["A:1"], "Flexible residues: A:1\n", b"ligand"
        )
    reflected = b"".join(
        row[:46] + f"{-float(row[46:54]):8.3f}".encode() + row[54:]
        if row[:6] == b"ATOM  " and row[12:16].strip() in {b"CB", b"OG"}
        else row
        for row in protein().splitlines(keepends=True)
    )
    with pytest.raises(ValueError, match="handedness"):
        normalize(protein(), reflected, ["A:1"], "Flexible residues: A:1\n", b"ligand")


@pytest.mark.parametrize("residue", ["ILE", "THR"])
def test_beta_handedness_is_not_confused_with_an_unchanged_alpha_center(residue):
    rows = [
        ("N", (-1.45, 0, 0), "N"),
        ("CA", (0, 0, 0), "C"),
        ("C", (0, 1.5, 0), "C"),
        ("O", (0, 2.7, 0), "O"),
        ("CB", (0, 0, 1.53), "C"),
        ("CG2", (-0.5, -1.3, 2), "C"),
    ]
    rows += (
        [("CG1", (1.4, 0, 2.1), "C"), ("CD1", (2.4, 0, 3.2), "C")]
        if residue == "ILE"
        else [("OG1", (1.1, 0, 2.2), "O")]
    )
    source = b"".join(
        line(i + 1, name, residue, "A", 1, xyz, element)
        for i, (name, xyz, element) in enumerate(rows)
    )
    reflected = b"".join(
        row[:38] + f"{-float(row[38:46]):8.3f}".encode() + row[46:]
        if row[12:16].strip() == b"CG2"
        else row
        for row in source.splitlines(keepends=True)
    )
    with pytest.raises(ValueError, match="handedness"):
        normalize(source, reflected, ["A:1"], "Flexible residues: A:1\n", b"ligand")


def test_declared_external_links_and_hydrogen_profile_keep_the_original_files_intact():
    source = protein()
    with pytest.raises(ValueError, match="external bond"):
        normalize(
            source + b"CONECT    6    7\n", source, ["A:1"], "Flexible residues: A:1\n", b"ligand"
        )
    hydrogen = line(8, "H", "SER", "A", 1, (0, 0, 1), "H")
    with pytest.raises(ValueError, match="heavy-atom"):
        normalize(source + hydrogen, source, ["A:1"], "Flexible residues: A:1\n", b"ligand")
    normalized, receipt = normalize(
        source, source + hydrogen, ["A:1"], "Flexible residues: A:1\n", b"ligand"
    )
    assert normalized == source
    assert receipt["raw_receptor_sha256"] == hashlib.sha256(source + hydrogen).hexdigest()


def test_receipt_is_bound_to_the_requested_selection_and_immutable_receptor(tmp_path):
    from types import SimpleNamespace

    from test_docking_reference import body

    from opendde_workbench.docking.flexible_validation import verify_refinement
    from opendde_workbench.docking.result import DockingResult
    from opendde_workbench.workflows.quality_bindings import validate_source

    source = protein()
    output, receipt = normalize(
        source, moved(source), ["A:1"], "Flexible residues: A:1\n", b"ligand"
    )
    value = task()
    value["receptor"]["sha256"] = hashlib.sha256(source).hexdigest()
    value["flexible_receptor"] = {"residues": [{"chain": "A", "number": 1}]}
    request = DockingTask.model_validate(value)
    report = body()
    report.update(
        mode="minimize",
        receptor=request.receptor.model_dump(mode="json"),
        frame=request.receptor.model_dump(mode="json"),
        receptor_refinement=receipt,
    )
    result = DockingResult.model_validate(report)
    for name, raw in (
        ("input-receptor.pdb", source),
        ("native-flex-receptor.pdb", moved(source)),
        ("receptor.pdb", output),
        ("poses.sdf", b"ligand"),
        ("native.log", b"Flexible residues: A:1\n"),
    ):
        (tmp_path / name).write_bytes(raw)
    verify_refinement(tmp_path, request, result)
    (tmp_path / "result.json").write_text(result.model_dump_json())
    # Workflow bindings also accept the updated receptor, never require the old digest.
    request = request.model_copy(update={"ligand": result.ligand, "options": result.options})
    validate_source(
        SimpleNamespace(target="quality_protein"),
        SimpleNamespace(request=request),
        tmp_path,
        tmp_path / "receptor.pdb",
    )
    changed = request.model_copy(
        update={"flexible_receptor": FlexibleReceptor(residues=[{"chain": "A", "number": 2}])}
    )
    with pytest.raises(ValueError):
        verify_refinement(tmp_path, changed, result)
    with pytest.raises(ValueError):
        verify_refinement(tmp_path, request.model_copy(update={"flexible_receptor": None}), result)
    bad = deepcopy(report)
    bad["receptor_refinement"]["original_receptor_sha256"] = "f" * 64
    with pytest.raises(ValidationError):
        DockingResult.model_validate(bad)
