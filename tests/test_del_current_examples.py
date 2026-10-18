"""Cohort identity and immutable input contracts; no scientific worker is started."""

import pytest
from pydantic import ValidationError

from opendde_workbench.examples.bundle_catalogue import bundle_catalogue
from opendde_workbench.examples.catalogue import FILES as ARCHIVE_FILES
from opendde_workbench.examples.contracts import SourceFile
from opendde_workbench.examples.del6.catalogue import CASE, FILES, MODULES
from opendde_workbench.examples.stat6.catalogue import MODULES as STAT6_MODULES


def test_default_del_identity_and_readonly_metadata_keep_original_target(client_factory):
    with client_factory() as client:
        assets = client.get("/api/assets").json()
        jobs = client.get("/api/jobs").json()
        values = client.get("/api/examples").json()["examples"]
        assert len(values) == len(STAT6_MODULES)
        for item in values:
            capability = item["module"]["capability_id"]
            current = client.get("/api/examples/" + capability).json()
            if capability.startswith("del."):
                assert current["study"]["target"] == "BRD4"
                assert current["study"]["id"] == current["study"]["profile"] == "del6"
                assert current["case"]["id"] == CASE.id
                assert current["module"]["revision"] == MODULES[capability].revision == 5
                assert not current["computed_result_available"]
                assert {row["sha256"] for row in current["files"]} == {
                    spec.sha256 for spec in FILES.values()
                }
            else:
                assert (
                    current == client.get("/api/examples/" + capability + "?profile=stat6").json()
                )
                assert current["study"]["target"] == "STAT6"
        assert client.get("/api/assets").json() == assets
        assert client.get("/api/jobs").json() == jobs


def test_historical_cohorts_and_exact_byte_identities_remain_distinct(client_factory):
    current, stat6, archive = (bundle_catalogue(key) for key in ("current", "stat6", "archive"))
    assert len({current.digest, stat6.digest, archive.digest}) == 3
    assert ARCHIVE_FILES["del_counts"].sha256 == (
        "ce248e3df7cac37c4de4b1b44cf565f71ebc51d9a59abdebec4ffd236fde91c0"
    )
    assert FILES["del_counts"].sha256 == (
        "0af8236a384393b33f11e98780b5f5f59c54a9ff55f9f0d11ad6782d73af7cfd"
    )
    assert FILES["del_counts"].bytes == 11872353
    assert FILES["del_followup"].sha256 != ARCHIVE_FILES["del_followup"].sha256
    assert FILES["del_reads"] == ARCHIVE_FILES["del_reads"]
    with client_factory() as client:
        legacy = client.get("/api/examples/del.library?profile=stat6").json()
        assert legacy["study"]["target"] == "STAT6"
        old = client.get("/api/examples/del.library?profile=archive").json()
        assert old["module"]["revision"] == 2
        assert client.get("/api/examples/del.library?profile=del6").json()["case"]["revision"] == 2


def test_larger_counts_do_not_relax_structure_or_configuration_bounds():
    source = FILES["del_counts"].model_dump()
    assert SourceFile.model_validate(source).bytes > 8 * 1024**2
    for kind in ("structure", "ligand", "sequences", "config", "measurements"):
        with pytest.raises(ValidationError, match="8 MiB"):
            SourceFile.model_validate({**source, "kind": kind})
    with pytest.raises(ValidationError):
        SourceFile.model_validate({**source, "bytes": 64 * 1024**2 + 1})


def test_sealed_del_replay_does_not_import_materials_again(monkeypatch):
    from opendde_workbench.examples.del6 import preparation

    sentinel = {"name": "A sealed contract recipe, not scientific output"}
    monkeypatch.setattr(preparation, "reviewed_request", lambda *args, **kwargs: sentinel)

    def forbidden(*args, **kwargs):
        raise AssertionError("A sealed recipe must not redownload or register replacement inputs.")

    monkeypatch.setattr(preparation, "register_dataset_input", forbidden)
    prepared = preparation.prepare_del6("del.library", None, None)
    assert prepared.request == sentinel
    assert prepared.data_assets == prepared.objects == {}
    assert prepared.study["target"] == "BRD4"
