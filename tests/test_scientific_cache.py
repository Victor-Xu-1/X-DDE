"""A complete cached image never bypasses the ordinary native CLI admission gate."""

import json

import pytest

from opendde_workbench.deployment import scientific_cache, scientific_install
from opendde_workbench.integrations.image import lock_digest, prepare_context
from opendde_workbench.integrations.image_identity import composer_digest
from opendde_workbench.integrations.specs import recipe_digest

IMAGE = "sha256:" + "a" * 64


def cached_runtime(**changes):
    return {
        "Id": IMAGE,
        "Os": "linux",
        "Architecture": "amd64",
        "Config": {
            "Labels": {
                "org.xdde.science.program": "reinvent",
                "org.xdde.science.recipe": recipe_digest("reinvent"),
                "org.xdde.science.lock": lock_digest("reinvent"),
                "org.xdde.science.composer": composer_digest(),
                **changes,
            }
        },
    }


def executor(image=None, *, identities=IMAGE):
    calls = []

    def execute(args, **kwargs):
        calls.append(args)
        if args[:3] == ["docker", "image", "ls"]:
            assert "reference=xdde-reinvent:" + recipe_digest("reinvent")[:16] in args
            return identities
        if args[:3] == ["docker", "image", "inspect"]:
            return json.dumps([image or cached_runtime()])
        if args[:2] == ["docker", "version"]:
            return "linux/amd64\n"
        raise AssertionError(args)

    return execute, calls


def test_complete_image_requires_all_composition_identities_and_server_platform():
    execute, calls = executor()
    assert scientific_cache.cached_image("reinvent", execute, lambda _: None) == IMAGE
    assert calls[1][-1] == IMAGE


@pytest.mark.parametrize("label", ["program", "recipe", "lock", "composer"])
def test_stale_cached_image_is_rebuilt_instead_of_used(label):
    execute, calls = executor(cached_runtime(**{"org.xdde.science." + label: "old"}))
    reports = []
    assert scientific_cache.cached_image("reinvent", execute, reports.append) is None
    assert reports and len(calls) == 2


def test_other_platform_or_missing_image_is_not_reused():
    execute, _ = executor({**cached_runtime(), "Architecture": "arm64"})
    assert scientific_cache.cached_image("reinvent", execute, lambda _: None) is None
    execute, calls = executor(identities="")
    assert scientific_cache.cached_image("reinvent", execute, lambda _: None) is None
    assert len(calls) == 1


@pytest.mark.parametrize("identities", ["not-an-id", IMAGE + "\nsha256:" + "b" * 64])
def test_malformed_or_ambiguous_cache_fails_closed(identities):
    execute, _ = executor(identities=identities)
    with pytest.raises(ValueError, match="immutable identity"):
        scientific_cache.cached_image("reinvent", execute, lambda _: None)


@pytest.mark.parametrize("identifier", ["reinvent", "plip"])
def test_cached_install_still_checks_full_native_cli_before_returning_receipt(
    tmp_path, monkeypatch, identifier
):
    monkeypatch.setattr(scientific_install.shutil, "which", lambda _: "/usr/bin/docker")
    monkeypatch.setattr(scientific_install, "cached_image", lambda *args: IMAGE)

    def no_staging(_):
        raise AssertionError("A complete image does not need source-build staging.")

    monkeypatch.setattr(scientific_install, "available_bytes", no_staging)
    calls = []

    def verify(identifier, image, execute, directory):
        calls.append((identifier, image))
        assert directory == tmp_path / "work"

    monkeypatch.setattr(
        "opendde_workbench.deployment.native_readiness.verify_native_entrypoint", verify
    )
    receipt = scientific_install.install_runtime(
        identifier, tmp_path, tmp_path / "work", None, lambda _: None, lambda: None
    )
    assert calls == [(identifier, IMAGE)]
    assert receipt["image"] == IMAGE and receipt["runtime_lock_sha256"] == lock_digest(identifier)
    assert receipt["recipe_sha256"] == recipe_digest(identifier)
    assert len(receipt) == 4

    def failed(*args):
        raise RuntimeError("Full native CLI dependency missing")

    monkeypatch.setattr(
        "opendde_workbench.deployment.native_readiness.verify_native_entrypoint", failed
    )
    with pytest.raises(RuntimeError, match="dependency missing"):
        scientific_install.install_runtime(
            identifier, tmp_path, tmp_path / "work", None, lambda _: None, lambda: None
        )


def test_image_labels_bind_actual_composer_and_dependency_bytes(tmp_path):
    source = tmp_path / "source"
    source.mkdir()
    context = tmp_path / "context"
    prepare_context("reinvent", context, source)
    dockerfile = (context / "Dockerfile").read_text()
    assert 'org.xdde.science.composer="' + composer_digest() + '"' in dockerfile
    assert 'org.xdde.science.lock="' + lock_digest("reinvent") + '"' in dockerfile
