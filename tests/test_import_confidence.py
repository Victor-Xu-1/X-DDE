import json
from uuid import uuid4

import pytest

from opendde_workbench.confidence import confidence_view
from opendde_workbench.native_import import import_document


def test_import_keeps_native_covalent_numbering_and_uploaded_features():
    identifier = str(uuid4())
    native = {
        "name": "prepared",
        "modelSeeds": [1, 2],
        "sequences": [
            {
                "proteinChain": {
                    "sequence": "AC",
                    "count": 1,
                    "id": ["A"],
                    "unpairedMsaPath": "/job/query.a3m",
                }
            },
            {"ligand": {"ligand": "CCO", "count": 1}},
        ],
        "covalent_bonds": [
            {
                "entity1": "1",
                "position1": "2",
                "atom1": "SG",
                "entity2": "2",
                "position2": "1",
                "atom2": 1,
            }
        ],
    }
    request = import_document(native, lambda path, kind: identifier)
    assert request.parameters.feature_mode == "uploaded"
    assert request.parameters.seeds == [1, 2]
    assert request.covalent_bonds[0].left.position == 2
    assert request.covalent_bonds[0].right.atom == "1"
    assert request.covalent_bonds[0].left.copy_index is None
    assert "copy1" not in request.covalent_bonds[0].native()
    assert request.components[0].chain_ids == ["A"]


def test_unknown_native_fields_are_not_silently_ignored():
    with pytest.raises(ValueError, match="Unsupported native"):
        import_document({"name": "unsupported", "constraint": {"distance": 5}}, lambda *_: None)


def test_confidence_sampling_preserves_native_indices_and_rejects_traversal(tmp_path):
    (tmp_path / "entry_sample_0.cif").write_text("structure")
    data = {"token_pair_pae": [[i + j for j in range(5)] for i in range(5)], "atom_plddt": [90, 80]}
    (tmp_path / "entry_full_data_sample_0.json").write_text(json.dumps(data))
    result = confidence_view(tmp_path, "entry_sample_0.cif", "pae", bins=2)
    assert result["indices"] == [0, 3]
    assert result["matrix"] == [[0, 3], [3, 6]]
    assert result["token_count"] == 5
    with pytest.raises(ValueError):
        confidence_view(tmp_path, "../outside.cif", "pae")
