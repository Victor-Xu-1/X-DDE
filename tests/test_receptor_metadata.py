"""Native UTF-8 annotations never relax structural identity or bond protection."""

import gzip
import hashlib
import json
from pathlib import Path

import pytest
from test_flexible_receptor import moved, protein

from opendde_workbench.docking.flexible_receptor import normalize, validate_selection, verify_pair
from opendde_workbench.docking.receptor_atoms import parse_atoms

FIXTURE = Path(__file__).with_name("fixtures") / "docking_metadata"
TITLE = "COMPND    STAT6 study PROTAC · metadata only\n".encode()


def test_retained_native_pair_keeps_raw_unicode_metadata_and_exact_atom_context(tmp_path):
    manifest = json.loads((FIXTURE / "source.json").read_text())
    native = {}
    for name, record in manifest["files"].items():
        native[name] = gzip.decompress((FIXTURE / (name + ".gz")).read_bytes())
        assert len(native[name]) == record["bytes"]
        assert hashlib.sha256(native[name]).hexdigest() == record["sha256"]
        (tmp_path / name).write_bytes(native[name])
    raw = native["native-flex-receptor.pdb"]
    assert b"COMPND    STAT6 study PROTAC \xc2\xb7" in raw
    before, after = parse_atoms(native["input-receptor.pdb"]), parse_atoms(raw)
    assert len(before) == len(after) == 6079 and before.keys() == after.keys()
    normalized, receipt = normalize(
        native["input-receptor.pdb"],
        raw,
        manifest["residues"],
        native["native.log"].decode(),
        native["poses.sdf"],
    )
    assert receipt["moved_sidechain_atoms"] == 21
    assert receipt["native_fixed_max_displacement_angstrom"] == 0
    assert receipt["native_backbone_max_displacement_angstrom"] == 0
    assert receipt["raw_receptor_sha256"] == manifest["files"]["native-flex-receptor.pdb"]["sha256"]
    (tmp_path / "receptor.pdb").write_bytes(normalized)
    verify_pair(tmp_path, receipt["original_receptor_sha256"], manifest["residues"], receipt)
    assert (tmp_path / "native-flex-receptor.pdb").read_bytes() == raw


def test_source_metadata_survives_paired_output_without_reindexing_atoms():
    original = TITLE + protein()
    expected = TITLE + moved(protein())
    normalized, receipt = normalize(
        original, expected, ["A:1"], "Flexible residues: A:1\n", b"ligand"
    )
    assert normalized == expected
    assert receipt["original_receptor_sha256"] == hashlib.sha256(original).hexdigest()
    assert receipt["moved_sidechain_atoms"] == 1


@pytest.mark.parametrize("column", [0, 12, 21, 31, 76])
def test_unicode_in_atom_record_names_identities_or_coordinates_is_rejected(column):
    lines = protein().splitlines(keepends=True)
    atom = lines[1]
    lines[1] = atom[:column] + "·".encode() + atom[column + 1 :]
    with pytest.raises(ValueError):
        parse_atoms(b"".join(lines))


def test_utf8_annotation_cannot_hide_a_declared_external_bond():
    original = TITLE + protein() + b"CONECT    6    7\n"
    with pytest.raises(ValueError, match="external bond"):
        normalize(original, moved(original), ["A:1"], "Flexible residues: A:1\n", b"ligand")


@pytest.mark.parametrize("record", [b"CONECT    6    7", b"LINK  ", b"SSBOND"])
def test_unicode_in_bond_records_is_rejected_before_fixed_column_interpretation(record):
    original = TITLE + protein() + record + "·\n".encode()
    with pytest.raises(ValueError, match="structural records must be ASCII"):
        validate_selection(parse_atoms(original), ["A:1"], original)


@pytest.mark.parametrize(
    "record", [b"CONECT    6    7", b"LINK  ", b"SSBOND", b"ANISOU", b"TER   ", b"CUSTOM"]
)
def test_unicode_in_native_structural_records_cannot_pass_normalization_or_pair_verification(
    record, tmp_path
):
    source = protein()
    valid = moved(source)
    log = "Flexible residues: A:1\n"
    normalized, receipt = normalize(source, valid, ["A:1"], log, b"ligand")
    corrupted = valid + record + "·\n".encode()
    with pytest.raises(ValueError, match="structural records must be ASCII"):
        normalize(source, corrupted, ["A:1"], log, b"ligand")
    for name, raw in (
        ("input-receptor.pdb", source),
        ("native-flex-receptor.pdb", corrupted),
        ("receptor.pdb", normalized),
        ("poses.sdf", b"ligand"),
        ("native.log", log.encode()),
    ):
        (tmp_path / name).write_bytes(raw)
    # Even a self-consistent raw-byte digest cannot legitimize corrupted structure fields.
    forged = {**receipt, "raw_receptor_sha256": hashlib.sha256(corrupted).hexdigest()}
    with pytest.raises(ValueError):
        verify_pair(tmp_path, receipt["original_receptor_sha256"], ["A:1"], forged)


def test_invalid_utf8_metadata_and_multiple_models_remain_invalid():
    with pytest.raises(ValueError, match="metadata must use valid UTF-8"):
        parse_atoms(b"COMPND    invalid \xff\n" + protein())
    multiple = TITLE + b"MODEL        1\n" + protein() + b"ENDMDL\nMODEL        2\n" + protein()
    with pytest.raises(ValueError, match="one receptor model"):
        parse_atoms(multiple)
