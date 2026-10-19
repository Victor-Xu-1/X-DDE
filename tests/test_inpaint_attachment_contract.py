"""Immutable old requests remain exact; new scope cannot be downgraded at result handoff."""

import json
from pathlib import Path

import pytest
from pydantic import ValidationError
from test_diffsbdd_quality import fixture_result

from opendde_workbench.diffsbdd.options import DiffOptions
from opendde_workbench.diffsbdd.quality import CoreVerification


def test_retained_real_request_options_do_not_gain_new_defaults_or_different_hashes():
    file = Path(__file__).parent / "fixtures/stat6/inpaint_attachment/provenance.json"
    original = json.loads(file.read_bytes())["original_options"]
    assert DiffOptions.model_validate(original).model_dump(mode="json") == original
    assert "attachment_policy" not in DiffOptions().model_dump(mode="json")


def test_only_inpainting_with_core_bonds_can_require_original_cut_sites():
    with pytest.raises(ValidationError, match="core bonds"):
        DiffOptions(
            task="inpaint",
            fixed_atoms=[0],
            fragment_policy="all",
            attachment_policy="original_cuts",
            preserve_bonds=False,
        )
    with pytest.raises(ValidationError, match="only supported"):
        DiffOptions(attachment_policy="original_cuts")


def test_strict_result_cannot_reuse_a_legacy_method_claim(tmp_path):
    _, _, _, _, result = fixture_result(tmp_path)
    evidence = result["core_verification"]
    evidence["attachment_policy"] = "original_cuts"
    with pytest.raises(ValidationError, match="method differs"):
        CoreVerification.model_validate(evidence)
    evidence.update(schema_version=2, method="rdkit_fixed_core_attachments_v2")
    with pytest.raises(ValidationError, match="exact declared selection"):
        CoreVerification.model_validate(evidence)
