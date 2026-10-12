"""Offline dependency staging retains registry, platform and immutable-byte boundaries."""

import hashlib

import pytest

from opendde_workbench.deployment import locked_packages as packages
from opendde_workbench.integrations.offline_context import stage_archives


@pytest.mark.parametrize(
    "filename,compatible",
    [
        ("native-1.0-cp310-cp310-manylinux_2_28_x86_64.whl", True),
        ("native-1.0-cp39-abi3-manylinux2014_x86_64.whl", True),
        ("native-1.0-py2.py3-none-any.whl", True),
        ("native-1.0-cp312-cp312-manylinux2014_x86_64.whl", False),
        ("native-1.0-cp310-cp310-win_amd64.whl", False),
        ("native-1.0-cp310-cp310-manylinux_2_28_aarch64.whl", False),
        ("native-1.0-cp310-cp310-manylinux_2_40_x86_64.whl", False),
        ("native-1.0.tar.gz", False),
    ],
)
def test_wheel_selection_preserves_the_reviewed_linux_python_boundary(filename, compatible):
    assert packages.compatible_wheel(filename) is compatible


def test_exact_requirements_reject_unhashed_or_extra_install_options(tmp_path):
    lock = tmp_path / "requirements.txt"
    lock.write_text("native==1.0 \\\n    --hash=sha256:" + "a" * 64 + "\n")
    assert packages.requirements(lock) == [("native", "1.0", {"a" * 64})]
    for content in ("native>=1.0\n", "native==1.0\n", "--trusted-host example.test\n"):
        lock.write_text(content)
        with pytest.raises(ValueError, match="exact versions"):
            packages.requirements(lock)


def test_pypi_metadata_cannot_replace_a_locked_wheel_or_redirect_its_registry(
    tmp_path, monkeypatch
):
    lock = tmp_path / "requirements.txt"
    lock.write_text("native==1.0 --hash=sha256:" + "a" * 64 + "\n")
    filename = "native-1.0-cp310-cp310-manylinux2014_x86_64.whl"
    entry = {
        "filename": filename,
        "url": "https://files.pythonhosted.org/packages/" + filename,
        "digests": {"sha256": "b" * 64},
    }
    monkeypatch.setattr(packages, "release_files", lambda *args: [entry])
    calls = []
    monkeypatch.setattr(packages, "download", lambda *args, **kwargs: calls.append((args, kwargs)))
    with pytest.raises(ValueError, match="No reviewed"):
        packages.wheel_archives(lock, tmp_path / "cache", lambda m: None, lambda: None)
    assert calls == []
    entry["digests"]["sha256"] = "a" * 64
    selected = packages.wheel_archives(lock, tmp_path / "cache", lambda m: None, lambda: None)
    assert selected[0]["file"] == tmp_path / "cache" / ("a" * 64) / filename
    assert calls[0][0][:3] == (entry["url"], selected[0]["file"], "a" * 64)
    entry["url"] = "https://unreviewed.example/" + filename
    with pytest.raises(ValueError, match="reviewed registry"):
        packages.wheel_archives(lock, tmp_path / "cache", lambda m: None, lambda: None)
    assert len(calls) == 1


def test_conda_archives_preserve_urls_and_hashes_and_reject_unreviewed_channels(
    tmp_path, monkeypatch
):
    lock = tmp_path / "conda.txt"
    url = "https://conda.anaconda.org/conda-forge/linux-64/native-1.0.conda"
    lock.write_text("@EXPLICIT\n" + url + "#" + "a" * 64 + "\n")
    calls = []
    monkeypatch.setattr(packages, "download", lambda *args, **kwargs: calls.append(args))
    entries = packages.conda_archives(lock, tmp_path / "cache", lambda m: None, lambda: None)
    assert entries[0]["url"] == url and entries[0]["sha256"] == "a" * 64
    assert calls[0][2] == "a" * 64
    lock.write_text("@EXPLICIT\n" + url.replace("conda-forge", "unreviewed") + "#" + "a" * 64)
    with pytest.raises(ValueError, match="reviewed channel"):
        packages.conda_archives(lock, tmp_path / "cache", lambda m: None, lambda: None)
    assert len(calls) == 1


def test_image_staging_rechecks_content_and_preserves_the_original_archive(tmp_path):
    original = tmp_path / "original.whl"
    original.write_bytes(b"reviewed native dependency")
    digest = hashlib.sha256(original.read_bytes()).hexdigest()
    entries = [{"file": original, "sha256": digest}]
    stage_archives(entries, tmp_path / "context")
    assert (tmp_path / "context" / original.name).read_bytes() == original.read_bytes()
    original.write_bytes(b"modified after download")
    with pytest.raises(ValueError, match="changed after checksum"):
        stage_archives(entries, tmp_path / "rejected")
    assert original.read_bytes() == b"modified after download"
    with pytest.raises(ValueError, match="requires verified"):
        stage_archives([], tmp_path / "empty")
