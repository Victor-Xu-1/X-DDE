"""Target-MSA file admission and provider failure envelopes; no alignment search."""

import hashlib
import importlib
import json
from pathlib import Path

import pytest


@pytest.fixture
def bridge(monkeypatch):
    root = Path(__file__).parents[1] / "src/opendde_workbench"
    monkeypatch.syspath_prepend(str(root))
    return importlib.import_module("harness_alignments")


def inputs(tmp_path):
    shared = tmp_path / "owned-shared"
    shared.mkdir()
    query = "ACDEFG"
    digest = hashlib.sha256(query.encode()).hexdigest()
    folder = shared / "msa" / ("Target-A-" + digest[:12])
    folder.mkdir(parents=True)
    raw = b"# original metadata\n>query\nACDEFG\n>homologue\nACa-EFG\n"
    (folder / "non_pairing.a3m").write_bytes(raw)
    (folder / "pairing.a3m").write_bytes(b">query\nACDEFG\n")
    job = tmp_path / "job"
    (job / "output").mkdir(parents=True)
    remote = "/worker/shared"
    result = {
        "target_name": "Target α",
        "chain_id": "A",
        "sequence_sha256": digest,
        "alignment_depth": 2,
        "available": True,
        "unpaired_msa_path": remote + "/msa/" + folder.name + "/non_pairing.a3m",
        "paired_msa_path": remote + "/msa/" + folder.name + "/pairing.a3m",
    }
    payload = {"target_name": "Target α", "chain_id": "A", "sequence": query}
    return shared, remote, job, folder, result, payload, raw


def test_exact_target_namespace_query_depth_and_source_bytes_are_preserved(tmp_path, bridge):
    shared, remote, job, folder, result, payload, raw = inputs(tmp_path)
    original = dict(result)
    retained, artifacts = bridge.collect_target_alignments(
        result, payload, job, shared=shared, remote=remote
    )
    assert artifacts == ["non_pairing.a3m", "pairing.a3m"]
    assert (job / "output/non_pairing.a3m").read_bytes() == raw
    assert (folder / "non_pairing.a3m").read_bytes() == raw and result == original
    assert [item["rows"] for item in retained["alignment_files"]] == [2, 1]
    assert retained["alignment_files"][0]["sha256"] == hashlib.sha256(raw).hexdigest()
    assert retained["unpaired_msa_path"] == "non_pairing.a3m"
    assert all(item["columns"] == 6 for item in retained["alignment_files"])


@pytest.mark.parametrize(
    "patch",
    [
        {"sequence_sha256": "0" * 64},
        {"chain_id": "B"},
        {"alignment_depth": 3},
        {"unpaired_msa_path": "/private/non_pairing.a3m"},
        {"paired_msa_path": "/worker/shared/msa/../pairing.a3m"},
    ],
)
def test_mismatched_identity_paths_or_depth_never_become_scientific_downloads(
    tmp_path, bridge, patch
):
    shared, remote, job, _, result, payload, _ = inputs(tmp_path)
    with pytest.raises(ValueError):
        bridge.collect_target_alignments(
            {**result, **patch}, payload, job, shared=shared, remote=remote
        )
    assert not list((job / "output").iterdir())


def test_msa_query_corruption_and_symbolic_links_are_refused(tmp_path, bridge):
    shared, remote, job, folder, result, payload, _ = inputs(tmp_path)
    (folder / "pairing.a3m").write_bytes(b">wrong\nAAAAAA\n")
    with pytest.raises(ValueError, match="query differs"):
        bridge.collect_target_alignments(result, payload, job, shared=shared, remote=remote)
    assert not list((job / "output").iterdir())
    outside = tmp_path / "outside.a3m"
    outside.write_bytes(b">query\nACDEFG\n")
    (folder / "pairing.a3m").unlink()
    (folder / "pairing.a3m").symlink_to(outside)
    with pytest.raises(ValueError, match="symbolic links"):
        bridge.collect_target_alignments(result, payload, job, shared=shared, remote=remote)
    assert not list((job / "output").iterdir())


def test_missing_shared_configuration_or_oversized_file_has_no_local_fallback(
    tmp_path, bridge, monkeypatch
):
    shared, remote, job, _, result, payload, _ = inputs(tmp_path)
    monkeypatch.delenv("WB_SHARED_DIR", raising=False)
    monkeypatch.delenv("WB_REMOTE_DIR", raising=False)
    with pytest.raises(ValueError, match="Configure shared"):
        bridge.collect_target_alignments(result, payload, job)
    monkeypatch.setattr(bridge, "MAX_BYTES", 10)
    with pytest.raises(ValueError, match="bounded"):
        bridge.collect_target_alignments(result, payload, job, shared=shared, remote=remote)


def test_error_prose_is_not_a_successful_protein_homology_result(bridge):
    validate = importlib.import_module("harness_result_validation").validate_search_response
    for body in (
        "ProTrek structure search unavailable: ",
        "",
        None,
        "Structure file not found: /private/input",
    ):
        with pytest.raises(RuntimeError, match="did not return a usable result"):
            validate("protrek-structure", {"available": True, "result": body})
    validate(
        "protrek-sequence",
        {
            "available": True,
            "result": (
                "### ProTrek Sequence-Based Search Results\n"
                "Verified evidence; annotation unavailable for one hit."
            ),
        },
    )
    validate(
        "protrek-structure", {"available": True, "result": "No matching homologues were found."}
    )
    validate("esm2", {"available": True, "result": {"candidates": []}})


def test_rejected_homology_envelope_is_preserved_privately_without_a_success_report(bridge, tmp_path):
    validate = importlib.import_module("harness_result_validation").validate_search_response
    provider = {
        "available": True,
        "result": "ProTrek structure search unavailable: provider returned an empty body.",
        "error": None,
    }
    with pytest.raises(RuntimeError, match="did not return a usable result"):
        validate("protrek-structure", provider, directory=tmp_path)
    original = (tmp_path / "native-search-response.json").read_bytes()
    assert json.loads(original) == provider
    assert not (tmp_path / "output/result.json").exists()
    with pytest.raises(RuntimeError):
        validate("protrek-structure", provider, directory=tmp_path)
    with pytest.raises(ValueError, match="remain unchanged"):
        validate("protrek-structure", {"result": "Different response"}, directory=tmp_path)
    assert (tmp_path / "native-search-response.json").read_bytes() == original


def test_homology_failure_evidence_is_bounded_and_does_not_apply_to_other_tools(bridge, tmp_path):
    validate = importlib.import_module("harness_result_validation").validate_search_response
    with pytest.raises(ValueError, match="evidence limit"):
        validate("protrek-sequence", {"result": "x" * (4 * 1024**2)}, directory=tmp_path)
    assert not list(tmp_path.iterdir())
    validate("esm2", {"result": {"candidates": []}}, directory=tmp_path)
    assert not list(tmp_path.iterdir())
