"""Dependency repairs cannot silently replace the reviewed scientific runtime."""

import importlib.util
from pathlib import Path

import pytest


def solver():
    path = Path(__file__).parents[1] / "scripts/resolve-openfe-lock.py"
    spec = importlib.util.spec_from_file_location("native_lock_retention", path)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


def package(name, digest="a" * 64):
    return {
        "url": "https://conda.anaconda.org/conda-forge/linux-64/" + name + ".conda",
        "sha256": digest,
    }


def test_new_parser_keeps_every_existing_package_build_digest_and_order(tmp_path):
    native = solver()
    numpy = package("numpy-2.5.3-py312_build0")
    python = package("python-3.12.14-build0", "b" * 64)
    bio = package("biopython-1.88-py312_build0", "c" * 64)
    path = tmp_path / "reviewed.txt"
    original = (
        "@EXPLICIT\n" + "\n".join(p["url"] + "#" + p["sha256"] for p in (numpy, python)) + "\n"
    )
    path.write_text(original)
    retained = native.retained_packages(path)
    assert [row["spec"] for row in retained] == [
        "numpy=2.5.3=py312_build0",
        "python=3.12.14=build0",
    ]
    updated = native.explicit_lock([bio, python, numpy], retained)
    assert updated == original + bio["url"] + "#" + bio["sha256"] + "\n"
    assert path.read_text() == original
    for changed in (
        [python, bio],
        [package("numpy-2.5.3-py312_build1"), python, bio],
        [package("numpy-2.5.3-py312_build0", "d" * 64), python, bio],
    ):
        with pytest.raises(ValueError, match="changed a retained dependency"):
            native.explicit_lock(changed, retained)


@pytest.mark.parametrize("suffix", ["?redirect=other", "/../escape", "#extra"])
def test_dependency_registry_or_path_reinterpretation_is_rejected(suffix):
    value = package("biopython-1.88-py312_build0")
    with pytest.raises(ValueError, match="trusted channel"):
        solver().package_identity(value["url"] + suffix, value["sha256"])


def test_empty_and_duplicate_native_locks_are_not_installable(tmp_path):
    value = package("biopython-1.88-py312_build0")
    for packages in ([], [value, value]):
        with pytest.raises(ValueError):
            solver().explicit_lock(packages)
    path = tmp_path / "reviewed.txt"
    path.write_text("@EXPLICIT\n" + value["url"] + "\n")
    with pytest.raises(ValueError, match="explicit SHA256"):
        solver().retained_packages(path)
