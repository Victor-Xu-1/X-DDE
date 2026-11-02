"""Native command/preview boundaries without executing a model or a simulation."""

import hashlib
import importlib
import json
from pathlib import Path

import pytest

from opendde_workbench.integrations.mol1_features import validate_features


@pytest.fixture
def native(monkeypatch):
    root = Path(__file__).resolve().parents[1] / "src/opendde_workbench/integrations"
    monkeypatch.syspath_prepend(str(root))
    return importlib.import_module("native_mol1"), importlib.import_module("native_mol1_confidence")


def test_native_options_are_executed_not_just_stored(native):
    from test_mol1 import task

    value = task(additional_seeds=[102], msa_pair_as_unpair=False).model_dump(mode="json")
    options = native[0].inference_options(value, "/input/specification.json", "/output/native")
    assert options["load_checkpoint_path"] == "/models/mol-1-base.pt"
    assert options["seeds"] == [101, 102]
    assert options["memory_settings"]["msa_pair_as_unpair"] is False
    assert options["use_msa"] is False
    assert options["use_rna_msa"] is False
    assert options["triatt_kernel"] == options["trimul_kernel"] == "torch"
    assert options["memory_settings"]["infer_setting.chunk_size"] == 512


def test_confidence_preserves_native_axes_scale_and_original_identity(native, tmp_path):
    data = {
        "token_asym_id": [1, 2],
        "atom_to_token_idx": [0, 1, 1],
        "atom_plddt": [0.91, 0.52, 0.87],
        **{
            key: [[0.0, 0.5], [0.25, 1.0]]
            for key in ("token_pair_pae", "token_pair_pde", "contact_probs")
        },
    }
    source, target = tmp_path / "full.json", tmp_path / "preview.json"
    original = json.dumps(data).encode()
    source.write_bytes(original)
    native[1].compact_confidence(source, target)
    result = json.loads(target.read_text())
    assert result["source_sha256"] == hashlib.sha256(original).hexdigest()
    assert source.read_bytes() == original
    assert result["atom_plddt"] == [0.91, 0.52, 0.87]
    assert result["token_indices"] == [0, 1]
    data["contact_probs"][0][1] = 1.01
    source.write_text(json.dumps(data))
    with pytest.raises(ValueError, match="probability"):
        native[1].compact_confidence(source, target)


def test_json_template_rejects_malformed_or_duplicate_mapping(tmp_path):
    from types import SimpleNamespace

    file = tmp_path / "hits.json"
    asset = SimpleNamespace(suffix=".json")
    component = SimpleNamespace(
        paired_msa=None, unpaired_msa=None, template_hits="template", value="PREACHINGS"
    )
    assets = SimpleNamespace(path=lambda _: file)
    for query in ([0, 0], [[0], 1], [-1, 1], [True, 1]):
        file.write_text(
            json.dumps(
                [{"mmcif": "data_template", "queryIndices": query, "templateIndices": [0, 1]}]
            )
        )
        with pytest.raises(ValueError):
            validate_features(component, {"template": asset}, assets)
