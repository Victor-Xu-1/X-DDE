"""Native UTF-8 annotations never relax structural identity or bond protection."""

import gzip
import hashlib
import json
from pathlib import Path

import pytest
from test_flexible_receptor import moved, protein

from opendde_workbench.docking.flexible_receptor import normalize, verify_pair
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
