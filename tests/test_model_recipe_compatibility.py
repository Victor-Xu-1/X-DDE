"""Reuse unchanged scientific assets across OS-library repairs, without loading models."""

import hashlib
import importlib.util
import json
import sys
from copy import deepcopy
from pathlib import Path
from types import SimpleNamespace

import pytest

from opendde_workbench.integrations import native_resources
from opendde_workbench.integrations.specs import PROGRAMS, recipe_digest


LEGACY = {
    "drugclip": "ab0363175f4cc81e2d9e73c3bd6aa0c8eaa941ad5c69e03874db29d7dde6648e",
    "reinvent": "5c795106ff2a9f697f8288c09a8d0e0f2fd9f955405e1726c7d1652f336ed3f5",
}


@pytest.mark.parametrize("program", LEGACY)
def test_only_system_library_changes_retain_the_reviewed_model_identity(program):
    current = deepcopy(PROGRAMS[program])
    assert native_resources.model_recipe_identity(current) == LEGACY[program]
    current["system_packages"] = ["libexpat1=reviewed-future-os-version"]
    assert native_resources.model_recipe_identity(current) == LEGACY[program]
    assert recipe_digest(program) != LEGACY[program], "Runtime images still require the repaired recipe."


@pytest.mark.parametrize("program", LEGACY)
@pytest.mark.parametrize("field", ["models", "pip", "source", "base", "source_dependencies"])
def test_any_other_recipe_change_cannot_claim_legacy_compatibility(program, field):
    changed = deepcopy(PROGRAMS[program])
    changed[field] = {"unreviewed": "changed"}
    assert native_resources.model_recipe_identity(changed) != LEGACY[program]


def test_resource_checks_still_reject_unknown_recipe_or_changed_weight_bytes(tmp_path):
    content = b"original scientific weights"
    resource = {"name": "weights.pt", "size": len(content),
                "sha256": hashlib.sha256(content).hexdigest()}
    spec = {"name": "isolated fixture", "models": [resource]}
    manifest = {"files": [resource], "recipe_sha256": native_resources.model_recipe_identity(spec)}
    (tmp_path / "weights.pt").write_bytes(content)
    file = tmp_path / "manifest.json"
    file.write_text(json.dumps(manifest))
    assert native_resources.model_files(tmp_path, spec, full_hash=True) == manifest
    for recipe in ("0" * 64, LEGACY["drugclip"]):
        file.write_text(json.dumps({**manifest, "recipe_sha256": recipe}))
        with pytest.raises(ValueError, match="reviewed recipe"):
            native_resources.model_files(tmp_path, spec)
    file.write_text(json.dumps(manifest))
    (tmp_path / "weights.pt").write_bytes(b"x" * len(content))
    with pytest.raises(ValueError, match="integrity check failed"):
        native_resources.model_files(tmp_path, spec, full_hash=True)


@pytest.mark.parametrize("manifest_recipe", [LEGACY["drugclip"], recipe_digest("drugclip")])
def test_native_encoder_keeps_the_actual_38_compound_index_fingerprint(
    tmp_path, monkeypatch, manifest_recipe
):
    # Retained native job f027c8d6-9b47-4455-abf9-4f545d624642, no inference fixture.
    policy = json.loads((Path(__file__).parent / "fixtures/encoder-policy-v1.json").read_text())
    monkeypatch.setitem(sys.modules, "native_resources", native_resources)
    monkeypatch.setitem(sys.modules, "torch", SimpleNamespace())
    path = Path(__file__).parents[1] / "src/opendde_workbench/datasets/drugclip_encoder.py"
    definition = importlib.util.spec_from_file_location("reviewed_encoder_identity", path)
    encoder = importlib.util.module_from_spec(definition)
    definition.loader.exec_module(encoder)
    recipes = tmp_path / "recipes.json"
    recipes.write_text(json.dumps({"programs": {"drugclip": PROGRAMS["drugclip"]}}))
    manifest = {"recipe_sha256": manifest_recipe, "files": policy["folds"]}
    # File-byte verification belongs to the shared guard above; a fingerprint must
    # neither instantiate a model nor load any of the multi-GB checkpoint files.
    monkeypatch.setattr(encoder, "model_files", lambda root, spec: manifest)
    fingerprint, body = encoder.fingerprint(tmp_path, recipes)
    assert body == policy
    assert fingerprint == "7df8d1f8e856325d1af49037461b9b65a132718cae18fe1cbd33e7f8b9e99a9c"
