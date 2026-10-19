"""A structural-tool upgrade must not invalidate an unchanged channel image."""

import hashlib
from pathlib import Path

import pytest

from opendde_workbench.locations import atomic_json
from opendde_workbench.receptors import image as receptor_image
from opendde_workbench.settings import Settings
from opendde_workbench.space import image as channel_image
from opendde_workbench.space.runtime import configuration


def test_channel_recipe_preserves_reviewed_installed_image_after_structure_upgrade(
    tmp_path, monkeypatch
):
    state, root = tmp_path / "state", tmp_path / "components"
    state.mkdir()
    root.mkdir()
    settings = Settings(
        state_dir=state,
        image_file=state / "image",
        code_file=state / "code",
        model_dir=root / "models",
        cache_dir=state / "cache",
    )
    # This is the installed pre-DockQ channel recipe, not a second accepted lock.
    original = "8521ab0242fbe776017be3001949ce2cd8bff1f39d73f760930f04a4a6be0835"
    assert channel_image.lock_digest() == original
    entry = {
        "version": "3.0.2",
        "image": "sha256:" + "a" * 64,
        "runtime_lock_sha256": original,
    }
    atomic_json(state / "deployment.json", {"root": str(root)})
    atomic_json(root / "installed.json", {"caver": entry})
    assert configuration(settings) == entry["image"]
    real_read = Path.read_bytes
    receptor_lock = Path(receptor_image.__file__).with_name("native-requirements.txt")

    def upgraded_structure_lock(path):
        raw = real_read(path)
        return (
            raw + b"\n# another independently reviewed structure upgrade\n"
            if (path == receptor_lock)
            else raw
        )

    monkeypatch.setattr(Path, "read_bytes", upgraded_structure_lock)
    assert channel_image.lock_digest() == original
    assert configuration(settings) == entry["image"]
    # Reproduce the old coupling: the same installed image becomes unusable.
    with monkeypatch.context() as legacy:
        legacy.setattr(channel_image, "LOCK", receptor_lock)
        with pytest.raises(ValueError, match="Install the channel-analysis"):
            configuration(settings)
    assert configuration(settings) == entry["image"]

    # Changing channel dependencies must still reject the old image.
    changed = tmp_path / "changed-channel-requirements.txt"
    changed.write_bytes(real_read(channel_image.LOCK) + b"\n# changed channel recipe\n")
    monkeypatch.setattr(channel_image, "LOCK", changed)
    assert channel_image.lock_digest() != original
    with pytest.raises(ValueError, match="Install the channel-analysis"):
        configuration(settings)


def test_channel_labels_and_context_keep_exact_own_dependency_identity(tmp_path, monkeypatch):
    source = tmp_path / "caver"
    source.mkdir()
    jar = source / "caver.jar"
    jar.write_bytes(b"independent reviewed binary fixture")
    monkeypatch.setattr(channel_image, "JAR_SHA256", hashlib.sha256(jar.read_bytes()).hexdigest())
    destination = tmp_path / "context"
    channel_image.prepare_context(destination, source)
    assert (destination / "requirements.txt").read_bytes() == channel_image.LOCK.read_bytes()
    labels = {
        "org.xdde.caver.version": "3.0.2",
        "org.xdde.caver.runtime-lock": channel_image.lock_digest(),
    }
    assert channel_image.labels_match(labels)
    assert not channel_image.labels_match({**labels, "org.xdde.caver.runtime-lock": "b" * 64})
    assert not channel_image.labels_match({**labels, "org.xdde.caver.version": "other"})
