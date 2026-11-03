import hashlib
import json

import pytest

from opendde_workbench.confidence import confidence_view


def native(tmp_path, **changes):
    structure = tmp_path / "native_sample_0.cif"
    structure.write_bytes(b"data_native_predicted_by_opendde\n#\n")
    data = {
        "token_pair_pae": [[0, 4], [5, 0]],
        "atom_plddt": [0.87, 0.98, 0.5],
        "atom_to_token_idx": [0, 0, 1],
        "token_asym_id": [7, 9],
        **changes,
    }
    full = tmp_path / "native_full_data_sample_0.json"
    full.write_bytes(json.dumps(data).encode())
    return structure, full


def test_native_binding_keeps_full_vectors_and_exact_byte_identities(tmp_path):
    structure, full = native(tmp_path)
    before = structure.read_bytes(), full.read_bytes()
    result = confidence_view(tmp_path, structure.name, "pae", bins=1)
    binding = result["binding"]
    assert result["structure_artifact"] == structure.name
    assert binding["protocol"] == "opendde-cif-row-v1"
    assert binding["structure_sha256"] == hashlib.sha256(before[0]).hexdigest()
    assert binding["confidence_sha256"] == hashlib.sha256(before[1]).hexdigest()
    assert binding["atom_to_token_idx"] == [0, 0, 1]
    assert binding["token_asym_id"] == [7, 9]  # Never assume 0 means chain A.
    assert result["indices"] == [0]
    assert (structure.read_bytes(), full.read_bytes()) == before


@pytest.mark.parametrize(
    "changes",
    [
        {"atom_to_token_idx": [0, True, 1]},
        {"atom_to_token_idx": [0, 0, 2]},
        {"atom_to_token_idx": [0, 0, 0]},
        {"atom_to_token_idx": [0]},
        {"token_asym_id": [False, 1]},
        {"token_asym_id": [0, 1.5]},
        {"token_asym_id": [0, float("nan")]},
    ],
)
def test_unsupported_mapping_does_not_hide_valid_matrix_or_native_download(tmp_path, changes):
    structure, full = native(tmp_path, **changes)
    result = confidence_view(tmp_path, structure.name, "pae")
    assert result["binding"] is None
    assert result["matrix"] == [[0, 4], [5, 0]]
    assert result["native_artifact"] == full.name


def test_experimental_b_factors_never_enable_native_confidence_colors(tmp_path):
    structure, _ = native(tmp_path)
    structure.write_bytes(b"data_experimental\n_atom_site.B_iso_or_equiv 87\n")
    assert confidence_view(tmp_path, structure.name, "pae")["binding"] is None
