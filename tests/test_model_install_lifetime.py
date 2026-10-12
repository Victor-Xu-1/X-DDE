"""Tiny offline model attempts exercise the real installer and publication authority."""

import hashlib
import io
import tarfile
import zipfile
import zlib
from contextlib import ExitStack
from pathlib import Path

import pytest

from opendde_workbench.deployment import scientific_install
from opendde_workbench.deployment.manager import DeploymentManager
from opendde_workbench.deployment.process import Paused
from opendde_workbench.integrations import specs
from opendde_workbench.locations import atomic_json


def checksum(value):
    return hashlib.sha256(value).hexdigest()


@pytest.fixture
def model_fixture(tmp_path, monkeypatch):
    manager = DeploymentManager(tmp_path / "state")
    manager.configure(str(tmp_path / "components"), False)
    root = Path(manager.store.config()["root"])
    expected = {"first.pt": b"A" * 4096, "second.pt": b"B" * 4096}
    resources = []
    cache = root / "downloads"
    cache.mkdir()
    for name, value in expected.items():
        sha = checksum(value)
        resources.append(
            {
                "name": name,
                "size": len(value),
                "sha256": sha,
                "url": "https://unused.invalid/" + name,
            }
        )
        (cache / ("ligandmpnn-" + sha[:16] + "-" + name)).write_bytes(value)
    recipe = {**specs.PROGRAMS["ligandmpnn"], "models": resources}
    programs = {**specs.PROGRAMS, "ligandmpnn": recipe}
    monkeypatch.setattr(specs, "PROGRAMS", programs)
    monkeypatch.setattr(scientific_install, "PROGRAMS", programs)
    monkeypatch.setattr(scientific_install, "available_bytes", lambda _: 32 * 1024**3)
    previous = root / "models" / "ligandmpnn" / "previous-accepted"
    previous.mkdir(parents=True)
    (previous / "sentinel.pt").write_bytes(b"previous accepted fixture")
    unrelated = previous.with_name("unrelated-active-attempt")
    unrelated.mkdir()
    (unrelated / "sentinel.pt").write_bytes(b"unrelated active attempt")
    installed = {
        "ligandmpnn": {"version": "fixture-runtime"},
        "ligandmpnn-models": {"version": "fixture-old", "models": str(previous)},
    }
    atomic_json(root / "installed.json", installed)
    operation = manager.enqueue("ligandmpnn-models", "upgrade")[-1]
    work = root / "operations" / operation
    work.mkdir(parents=True)
    (work / "checkpoint").write_bytes(b"operation checkpoint")
    (cache / "unrelated.part").write_bytes(b"partial download")
    monkeypatch.setattr("urllib.request.urlopen", lambda *a, **k: pytest.fail("No network allowed"))
    return manager, root, previous, unrelated, installed, operation, recipe, expected


def preserve(fixture, *, accepted=None):
    manager, root, previous, unrelated, installed, operation, _, expected = fixture
    assert (previous / "sentinel.pt").read_bytes() == b"previous accepted fixture"
    assert (unrelated / "sentinel.pt").read_bytes() == b"unrelated active attempt"
    assert (root / "operations" / operation / "checkpoint").read_bytes() == b"operation checkpoint"
    assert (root / "downloads" / "unrelated.part").read_bytes() == b"partial download"
    for name, value in expected.items():
        assert (
            root / "downloads" / ("ligandmpnn-" + checksum(value)[:16] + "-" + name)
        ).read_bytes() == value
    assert set(previous.parent.iterdir()) == {previous, unrelated} | (
        {accepted} if accepted else set()
    )
    if accepted is None:
        assert manager.store.installed() == installed
    else:
        for name, value in expected.items():
            assert (accepted / name).read_bytes() == value


def test_repeated_manager_pause_resume_reclaims_only_unpublished_attempt(
    model_fixture, monkeypatch
):
    manager, root, previous, unrelated, installed, operation, _, _ = model_fixture
    copyfile = scientific_install.shutil.copyfile
    pause_on_copy = True

    def copy_and_pause(source, destination, *args, **kwargs):
        result = copyfile(source, destination, *args, **kwargs)
        if pause_on_copy and manager.store.get(operation)["state"] == "running":
            manager.control(operation, "pause")
        return result

    monkeypatch.setattr(scientific_install.shutil, "copyfile", copy_and_pause)
    for attempt in range(2):
        if attempt:
            manager.control(operation, "resume")
        manager.tick()
        assert manager.store.get(operation)["state"] == "paused"
        preserve(model_fixture)
    pause_on_copy = False
    manager.control(operation, "resume")
    manager.tick()
    assert manager.store.get(operation)["state"] == "succeeded"
    preserve(model_fixture, accepted=Path(manager.store.installed()["ligandmpnn-models"]["models"]))


@pytest.mark.parametrize(
    "failure", ["before_creation", "copy", "hash", "manifest", "after_return", "publication"]
)
def test_failed_manager_attempt_preserves_prior_models_and_resume_state(
    model_fixture, monkeypatch, failure
):
    manager, root, _, _, _, operation, _, _ = model_fixture

    def fail(*args, **kwargs):
        raise OSError("controlled " + failure)

    if failure == "before_creation":
        monkeypatch.setattr(scientific_install, "available_bytes", lambda _: 0)
    elif failure == "copy":
        copyfile = scientific_install.shutil.copyfile

        def partial_copy(source, destination):
            copyfile(source, destination)
            fail()

        monkeypatch.setattr(scientific_install.shutil, "copyfile", partial_copy)
    elif failure == "hash":
        monkeypatch.setattr(scientific_install, "digest", fail)
    elif failure == "manifest":
        monkeypatch.setattr(scientific_install, "atomic_json", fail)
    elif failure == "after_return":
        original = scientific_install.install_models

        def pause_after_return(*args, **kwargs):
            result = original(*args, **kwargs)
            manager.control(operation, "pause")
            return result

        monkeypatch.setattr(scientific_install, "install_models", pause_after_return)
    else:
        monkeypatch.setattr("opendde_workbench.deployment.manager.atomic_json", fail)
    manager.tick()
    assert manager.store.get(operation)["state"] == (
        "paused" if failure == "after_return" else "failed"
    )
    preserve(model_fixture)


@pytest.mark.parametrize("failure", ["atomic_return", "operation_state"])
def test_failure_after_publication_never_removes_accepted_models(
    model_fixture, monkeypatch, failure
):
    manager, root, _, _, _, operation, _, _ = model_fixture
    if failure == "atomic_return":

        def publish_then_fail(path, value):
            atomic_json(path, value)
            raise OSError("controlled failure after atomic replacement")

        monkeypatch.setattr("opendde_workbench.deployment.manager.atomic_json", publish_then_fail)
    else:
        update = manager.store.update

        def update_then_fail(identifier, **values):
            if values.get("state") == "succeeded":
                raise OSError("controlled operation-state failure")
            return update(identifier, **values)

        monkeypatch.setattr(manager.store, "update", update_then_fail)
    manager.tick()
    assert manager.store.get(operation)["state"] == "failed"
    preserve(model_fixture, accepted=Path(manager.store.installed()["ligandmpnn-models"]["models"]))


def archive_recipe(fixture, transport):
    _, root, _, _, _, _, recipe, expected = fixture
    content = io.BytesIO()
    if transport == "tar":
        with tarfile.open(fileobj=content, mode="w") as archive:
            for name, value in expected.items():
                entry = tarfile.TarInfo("nested/" + name)
                entry.size = len(value)
                archive.addfile(entry, io.BytesIO(value))
    else:
        with zipfile.ZipFile(content, "w") as archive:
            for name, value in expected.items():
                archive.writestr("nested/" + name, value)
    data = content.getvalue()
    row = {
        "name": "models.tar" if transport == "tar" else "models.zip",
        "size": len(data),
        "sha256": checksum(data),
        "url": "https://unused.invalid/archive",
    }
    (root / "downloads" / ("ligandmpnn-" + checksum(data)[:16] + "-" + row["name"])).write_bytes(
        data
    )
    if transport not in {"archive", "tar"}:
        row["selected_members"] = []
        for name, value in expected.items():
            member = {
                "name": name,
                "member": "nested/" + name,
                "size": len(value),
                "sha256": checksum(value),
            }
            if transport == "range":
                compressor = zlib.compressobj(wbits=-15)
                compressed = compressor.compress(value) + compressor.flush()
                member["transport"] = {
                    "kind": "verified_zip_range",
                    "start": 0,
                    "size": len(compressed),
                    "sha256": checksum(compressed),
                    "compression": 8,
                    "crc32": zlib.crc32(value),
                }
                (
                    root / "downloads" / ("ligandmpnn-" + checksum(value)[:16] + ".deflate")
                ).write_bytes(compressed)
            row["selected_members"].append(member)
    recipe["models"] = [row]


@pytest.mark.parametrize("transport", ["archive", "tar", "selected", "range"])
@pytest.mark.parametrize("interrupt", [False, True])
def test_tiny_archives_and_selected_transports_have_owned_lifetime(
    model_fixture, transport, interrupt
):
    _, root, previous, unrelated, _, _, _, expected = model_fixture
    archive_recipe(model_fixture, transport)
    calls = 0

    def checkpoint():
        nonlocal calls
        calls += 1
        if interrupt and calls == 2:
            raise Paused()

    if interrupt:
        with pytest.raises(Paused):
            scientific_install.install_models("ligandmpnn", root, lambda _: None, checkpoint)
        preserve(model_fixture)
    else:
        result = scientific_install.install_models("ligandmpnn", root, lambda _: None, checkpoint)
        accepted = Path(result["models"])
        assert set(previous.parent.iterdir()) == {previous, unrelated, accepted}
        for name, value in expected.items():
            assert (
                accepted / ("nested/" + name if transport in {"archive", "tar"} else name)
            ).read_bytes() == value


@pytest.mark.parametrize("target", ["models", "program"])
def test_symlink_model_parent_is_rejected_without_writing_outside(model_fixture, tmp_path, target):
    _, root, previous, _, _, _, _, _ = model_fixture
    parent = root / "models" if target == "models" else previous.parent
    moved = parent.with_name(parent.name + "-retained")
    parent.rename(moved)
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "sentinel").write_bytes(b"outside")
    parent.symlink_to(outside, target_is_directory=True)
    with pytest.raises(ValueError, match="real owned directories"):
        scientific_install.install_models("ligandmpnn", root, lambda _: None, lambda: None)
    assert list(outside.iterdir()) == [outside / "sentinel"]
    assert (
        moved
        / ("ligandmpnn/previous-accepted" if target == "models" else "previous-accepted")
        / "sentinel.pt"
    ).read_bytes() == b"previous accepted fixture"


@pytest.mark.parametrize("replacement", ["directory", "symlink", "parent"])
def test_cleanup_rejects_replaced_attempt_ownership(model_fixture, tmp_path, replacement):
    _, root, _, _, _, _, _, _ = model_fixture
    pending = ExitStack()
    result = scientific_install.install_models(
        "ligandmpnn", root, lambda _: None, lambda: None, pending=pending
    )
    owned = Path(result["models"])
    moved = owned.with_name(owned.name + "-retained")
    if replacement == "parent":
        owned.parent.rename(owned.parent.with_name("retained-parent"))
        owned.parent.mkdir()
        owned.mkdir()
        (owned / "sentinel").write_bytes(b"replacement")
    else:
        owned.rename(moved)
        if replacement == "directory":
            owned.mkdir()
            (owned / "sentinel").write_bytes(b"replacement")
        else:
            outside = tmp_path / "outside"
            outside.mkdir()
            (outside / "sentinel").write_bytes(b"replacement")
            owned.symlink_to(outside, target_is_directory=True)
    with pytest.raises(ValueError, match="ownership changed|real owned directories"):
        pending.close()
    assert (owned / "sentinel").read_bytes() == b"replacement"


def test_unreadable_publication_authority_retains_attempt(model_fixture):
    _, root, _, _, _, _, _, _ = model_fixture
    pending = ExitStack()
    result = scientific_install.install_models(
        "ligandmpnn", root, lambda _: None, lambda: None, pending=pending
    )
    (root / "installed.json").write_text("incomplete metadata")
    with pytest.raises(ValueError):
        pending.close()
    assert (Path(result["models"]) / "first.pt").read_bytes() == b"A" * 4096


def test_cleanup_does_not_follow_links_inside_owned_attempt(model_fixture, tmp_path):
    _, root, _, _, _, _, _, _ = model_fixture
    pending = ExitStack()
    result = scientific_install.install_models(
        "ligandmpnn", root, lambda _: None, lambda: None, pending=pending
    )
    owned = Path(result["models"])
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "sentinel").write_bytes(b"outside bytes")
    (owned / "external-link").symlink_to(outside, target_is_directory=True)
    pending.close()
    assert not owned.exists()
    assert (outside / "sentinel").read_bytes() == b"outside bytes"
    preserve(model_fixture)


def test_owned_attempt_cannot_reuse_an_existing_directory(model_fixture, monkeypatch):
    _, root, previous, _, _, _, _, _ = model_fixture
    monkeypatch.setattr(scientific_install, "uuid4", lambda: "collision")
    collision = previous.with_name(specs.recipe_digest("ligandmpnn")[:16] + "-collision")
    collision.mkdir()
    (collision / "sentinel").write_bytes(b"existing data")
    with pytest.raises(FileExistsError):
        scientific_install.install_models("ligandmpnn", root, lambda _: None, lambda: None)
    assert (collision / "sentinel").read_bytes() == b"existing data"


@pytest.mark.parametrize("moment", ["authority_read", "content_traversal"])
def test_replacement_during_cleanup_never_deletes_replacement_contents(
    model_fixture, monkeypatch, moment
):
    _, root, _, _, _, _, _, _ = model_fixture
    pending = ExitStack()
    result = scientific_install.install_models(
        "ligandmpnn", root, lambda _: None, lambda: None, pending=pending
    )
    owned = Path(result["models"])
    moved = owned.with_name(owned.name + "-original")

    def replace():
        owned.rename(moved)
        owned.mkdir()
        (owned / "sentinel").write_bytes(b"unrelated replacement")

    if moment == "authority_read":
        read_json = scientific_install.read_json

        def replace_on_read(path):
            value = read_json(path)
            replace()
            return value

        monkeypatch.setattr(scientific_install, "read_json", replace_on_read)
    else:
        scandir = scientific_install.os.scandir

        def replace_on_scan(path):
            replace()
            return scandir(path)

        monkeypatch.setattr(scientific_install.os, "scandir", replace_on_scan)
    with pytest.raises(ValueError, match="ownership changed"):
        pending.close()
    assert (owned / "sentinel").read_bytes() == b"unrelated replacement"
    if moment == "authority_read":
        assert (moved / "first.pt").read_bytes() == b"A" * 4096
    else:
        assert not list(moved.iterdir())  # Only the descriptor-owned attempt was cleared.
