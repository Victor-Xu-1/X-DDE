"""Actual byte transport, recovery, archive expansion and native recipe checks."""

import hashlib
import io
import zlib

import pytest

from opendde_workbench.deployment.model_ranges import download_member
from opendde_workbench.deployment.transfers import download
from opendde_workbench.integrations.image import prepare_context
from opendde_workbench.integrations.specs import PROGRAMS


@pytest.mark.parametrize(
    "package", ["public-examples", "public-dataset-examples", "public-surface-examples"]
)
def test_case_component_queue_restores_into_current_state(package, tmp_path, monkeypatch):
    """Exercise installer/archive/SQLite boundaries without pretending to compute science."""
    import shutil
    from dataclasses import replace
    from uuid import uuid4

    from opendde_workbench.deployment import installers
    from opendde_workbench.deployment.manager import DeploymentManager
    from opendde_workbench.examples import bundle
    from opendde_workbench.examples.bundle_archive import sha256, write_archive
    from opendde_workbench.examples.bundle_projection import TABLES
    from opendde_workbench.store import Store

    state = tmp_path / "state"
    manager = DeploymentManager(state)
    manager.configure(str(tmp_path / "components"), False)
    identifier = str(uuid4())
    rows = {name: [] for name in TABLES}
    rows["projects"] = [
        {
            "id": identifier,
            "name": "Public archive protocol",
            "description": "",
            "created_at": "today",
        }
    ]
    archive = tmp_path / "protocol.zip"
    write_archive(
        archive,
        {"schema_version": 1, "catalogue_sha256": bundle.catalogue_digest(), "records": rows},
        {},
    )
    checksum = sha256(archive)
    monkeypatch.setitem(
        installers.PACKAGES, package, replace(installers.PACKAGES[package], checksum=checksum)
    )

    def download(url, destination, expected, report, checkpoint):
        assert expected == checksum
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(archive, destination)

    monkeypatch.setattr(installers, "download", download)
    # This transport fixture contains only a project record, never a scientific prediction.
    monkeypatch.setattr(bundle, "verify_examples", lambda settings: {"modules": 0})
    operation = manager.enqueue(package, "install")[0]
    manager.tick()
    assert manager.store.get(operation)["state"] == "succeeded"
    assert manager.store.installed()[package]["bundle_sha256"] == checksum
    with Store(state / "jobs.sqlite3").connect() as database:
        assert (
            database.execute("SELECT name FROM projects WHERE id=?", (identifier,)).fetchone()[0]
            == "Public archive protocol"
        )
        assert database.execute("SELECT count(*) FROM jobs").fetchone()[0] == 0


class Response(io.BytesIO):
    def __init__(self, content, status, headers):
        super().__init__(content)
        self.status, self.headers = status, headers


def test_incomplete_public_download_keeps_confirmed_bytes_and_resumes_exactly(
    tmp_path, monkeypatch
):
    content = b"complete scientific model resource"
    checksum = hashlib.sha256(content).hexdigest()
    destination = tmp_path / "model.pt"
    first = True

    def respond(request, timeout):
        nonlocal first
        if first:
            first = False
            return Response(content[:10], 200, {"Content-Length": str(len(content))})
        assert request.get_header("Range") == "bytes=10-"
        return Response(
            content[10:],
            206,
            {
                "Content-Length": str(len(content) - 10),
                "Content-Range": f"bytes 10-{len(content) - 1}/{len(content)}",
            },
        )

    monkeypatch.setattr("urllib.request.urlopen", respond)
    with pytest.raises(RuntimeError, match="retained"):
        download(
            "https://official.example/resource", destination, checksum, lambda _: None, lambda: None
        )
    assert destination.with_suffix(".pt.part").read_bytes() == content[:10]
    assert not destination.exists()
    download(
        "https://official.example/resource", destination, checksum, lambda _: None, lambda: None
    )
    assert destination.read_bytes() == content


def test_official_zip_range_uses_reviewed_transport_and_expanded_member_hashes(
    tmp_path, monkeypatch
):
    raw = b"verified official checkpoint bytes" * 500
    compressor = zlib.compressobj(wbits=-15)
    compressed = compressor.compress(raw) + compressor.flush()
    start = 310
    resource = {
        "url": "https://official.example/model_weights.zip",
        "size": start + len(compressed) + 20,
    }
    member = {
        "name": "fold_0.pt",
        "size": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "transport": {
            "kind": "verified_zip_range",
            "start": start,
            "size": len(compressed),
            "sha256": hashlib.sha256(compressed).hexdigest(),
            "compression": 8,
            "crc32": zlib.crc32(raw),
        },
    }

    def respond(request, timeout):
        assert request.get_header("Range") == f"bytes={start}-{start + len(compressed) - 1}"
        return Response(
            compressed,
            206,
            {
                "Content-Length": str(len(compressed)),
                "Content-Range": f"bytes {start}-{start + len(compressed) - 1}/{resource['size']}",
            },
        )

    monkeypatch.setattr("urllib.request.urlopen", respond)
    output = tmp_path / "models"
    output.mkdir()
    download_member(
        resource, member, output, tmp_path / "cache/member.deflate", lambda _: None, lambda: None
    )
    assert (output / member["name"]).read_bytes() == raw
    # Verified resources are reusable without network or changing their model identity.
    monkeypatch.setattr(
        "urllib.request.urlopen",
        lambda *args, **kwargs: pytest.fail("Already verified member must be reused"),
    )
    download_member(
        resource, member, output, tmp_path / "cache/member.deflate", lambda _: None, lambda: None
    )


@pytest.mark.parametrize("status,content_range", [(200, ""), (206, "bytes 0-4/99")])
def test_a_server_ignoring_the_exact_official_range_never_activates_a_model(
    tmp_path, monkeypatch, status, content_range
):
    member = {
        "name": "fold.pt",
        "size": 5,
        "sha256": "a" * 64,
        "transport": {
            "kind": "verified_zip_range",
            "start": 10,
            "size": 5,
            "sha256": "b" * 64,
            "compression": 0,
            "crc32": 0,
        },
    }
    monkeypatch.setattr(
        "urllib.request.urlopen",
        lambda *args, **kwargs: Response(
            b"wrong", status, {"Content-Length": "5", "Content-Range": content_range}
        ),
    )
    with pytest.raises(ValueError, match="exact public model range"):
        download_member(
            {"url": "https://official.example/archive", "size": 99},
            member,
            tmp_path,
            tmp_path / "cache/segment",
            lambda _: None,
            lambda: None,
        )
    assert not (tmp_path / "fold.pt").exists()


def test_native_drugclip_recipe_uses_fixed_sources_and_only_a_device_initialization_patch(tmp_path):
    source = tmp_path / "upstream"
    (source / "unimol/models").mkdir(parents=True)
    patch = PROGRAMS["drugclip"]["source"]["patches"][0]
    file = source / patch["file"]
    file.write_text("scale = " + patch["old"])
    dependency = tmp_path / "unicore"
    dependency.mkdir()
    (dependency / "setup.py").write_text("DISABLE_CUDA_EXTENSION = True")
    context = tmp_path / "context"
    prepare_context("drugclip", context, source, extra_sources={"unicore": dependency})
    assert patch["new"] in (context / "source" / patch["file"]).read_text()
    assert patch["old"] in file.read_text()
    dockerfile = (context / "Dockerfile").read_text()
    assert "--require-hashes" in dockerfile and "--no-build-isolation" in dockerfile
    assert "ENV PYTHONPATH=/opt/native" in dockerfile
    assert "--enable-cuda-ext" not in dockerfile
    assert all(
        len(row["sha256"]) == 64 for row in PROGRAMS["drugclip"]["models"][0]["selected_members"]
    )
