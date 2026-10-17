"""A reviewed disease context is explicit; no generic pin-admission rule is relaxed."""

import hashlib
import json
from types import SimpleNamespace

import pytest

from opendde_workbench.discovery.contract import TargetResearchTask
from opendde_workbench.examples.bundle_catalogue import bundle_catalogue
from opendde_workbench.examples.catalogue_profiles import compatible_modules
from opendde_workbench.examples.pin_validation import validate_case_job
from opendde_workbench.examples.stat6.catalogue import CASE, MANIFEST, MODULES, ROOT
from opendde_workbench.examples.stat6.reference_inputs import case_for


def request(entity, identifier):
    return SimpleNamespace(
        request=TargetResearchTask(
            name="Evidence admission protocol",
            entity=entity,
            identifier=identifier,
            include_materials=False,
            limit=50,
            allow_external=True,
        )
    )


def prepared(capability):
    return SimpleNamespace(module=MODULES[capability], case=case_for(capability))


def test_reviewed_asthma_context_does_not_change_the_sealed_molecular_catalogue():
    frozen = (ROOT / "manifest-v2.json").read_bytes()
    assert hashlib.sha256(frozen).hexdigest() == (
        "4008b09f8c63dc91d475abd45085fab116f461902c345768724f87db8cb2e158"
    )
    prior = json.loads(frozen)
    case = case_for("discovery.disease")
    assert case is CASE
    assert case.evidence_entities["disease"]["id"] == "MONDO_0004979"
    validate_case_job(
        "discovery.disease",
        request("disease", "MONDO_0004979"),
        prepared("discovery.disease"),
        None,
    )
    assert MANIFEST["files"] == prior["files"]
    assert case.files == tuple(prior["case"]["files"])
    assert "disease" not in prior["case"]["evidence_entities"]
    assert {key: value for key, value in case.evidence_entities.items() if key != "disease"} == (
        prior["case"]["evidence_entities"]
    )
    assert bundle_catalogue("stat6").digest == (
        "ab96cb1a23c22b7bc7294efe39262caa463d1e9fc6f71b643166120918dc1d0e"
    )
    assert "discovery.disease" in compatible_modules(
        "353136d88e3c4c8f01f54a13f40136bb5ff81bbc2f24f9a87402c9b9044698a0", profile="stat6"
    )


@pytest.mark.parametrize("identifier", ["EFO_0000311", "MONDO_0005405"])
def test_other_diseases_still_require_a_separately_reviewed_example_context(identifier):
    with pytest.raises(ValueError, match="does not belong to the reviewed case"):
        validate_case_job(
            "discovery.disease",
            request("disease", identifier),
            prepared("discovery.disease"),
            None,
        )


def test_target_example_identity_remains_exact_and_separate_from_disease_context():
    assert case_for("discovery.target") is CASE
    validate_case_job(
        "discovery.target",
        request("target", "ENSG00000166888"),
        prepared("discovery.target"),
        None,
    )
    with pytest.raises(ValueError, match="does not belong to the reviewed case"):
        validate_case_job(
            "discovery.target",
            request("target", "ENSG00000146648"),
            prepared("discovery.target"),
            None,
        )
