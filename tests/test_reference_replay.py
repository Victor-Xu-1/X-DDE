"""The browser capture cannot alter native bytes or silently use a live fallback."""

import json
import shutil

import pytest

from server_tests.reference_archive_replay import CAPTURE, PREFIX, ArchiveReplay


def test_exact_capture_metadata_and_sdf_are_replayed_without_network(tmp_path):
    log = tmp_path / "requests.jsonl"
    replay = ArchiveReplay(log=log)
    for suffix in (".json", ".sdf"):
        raw, receipt = replay.request_bytes(PREFIX + suffix, require_json=suffix == ".json")
        assert raw == (CAPTURE / ("CHEMBL376085" + suffix)).read_bytes()
        assert receipt["raw_document"] == raw and receipt["url"] == PREFIX + suffix
    assert len(log.read_text().splitlines()) == 2


@pytest.mark.parametrize("url,body,require_json", [
    (PREFIX.replace("376085", "25") + ".sdf", None, False),
    (PREFIX + ".json", {"query": "unexpected"}, True),
    (PREFIX + ".sdf", None, True),
])
def test_unreviewed_requests_never_fall_back_to_live_transport(url, body, require_json):
    with pytest.raises(ValueError, match="unreviewed request"):
        ArchiveReplay().request_bytes(url, body, require_json=require_json)


def test_capture_tampering_is_rejected_before_startup_or_after_verification(tmp_path):
    capture = tmp_path / "capture"
    shutil.copytree(CAPTURE, capture)
    replay = ArchiveReplay(capture)
    (capture / "CHEMBL376085.sdf").write_bytes(b"changed")
    with pytest.raises(ValueError, match="bytes changed"):
        replay.request_bytes(PREFIX + ".sdf", require_json=False)
    with pytest.raises(ValueError, match="bytes changed"):
        ArchiveReplay(capture)
    data = json.loads((capture / "source.json").read_text())
    data["responses"][0]["url"] = "https://example.test/not-the-source"
    (capture / "source.json").write_text(json.dumps(data))
    with pytest.raises(ValueError, match="two reviewed"):
        ArchiveReplay(capture)
