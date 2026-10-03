"""Version carries, legacy transition and real manifest consistency."""

import importlib.util
import json
from pathlib import Path

import pytest

from opendde_workbench.versioning import ReleaseNumber

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "release_version", ROOT / "scripts/release-version.py"
)
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


@pytest.mark.parametrize(
    "before,after",
    [
        ("0.1.1", "0.1.2"),
        ("0.1.99", "0.1.100"),
        ("0.1.100", "0.2.0"),
        ("0.10.99", "0.10.100"),
        ("0.10.100", "1.0.0"),
        ("1.10.100", "2.0.0"),
    ],
)
def test_exact_carry_rules(before, after):
    assert str(ReleaseNumber.parse(before).next()) == after


@pytest.mark.parametrize("value", ["0.11.0", "0.1.101", "0.1.0rc1", "0.01.1", "v0.1.1", "-1.1.1"])
def test_invalid_current_versions_are_rejected(value):
    with pytest.raises(ValueError):
        ReleaseNumber.parse(value)


def test_legacy_rc_moves_forward_without_downgrading():
    assert str(ReleaseNumber.parse("0.4.0rc6", legacy=True).next()) == "0.4.1"


def test_numeric_comparison_is_not_lexicographic():
    assert ReleaseNumber.parse("0.10.0") > ReleaseNumber.parse("0.9.100")
    assert ReleaseNumber.parse("0.1.100") > ReleaseNumber.parse("0.1.99")


def test_repository_version_has_consistent_mirrors():
    assert str(release.check(ROOT)) == release.read_version(ROOT)


def test_stale_frontend_version_is_detected(tmp_path):
    for name in (
        "pyproject.toml",
        "uv.lock",
        "frontend/package.json",
        "frontend/package-lock.json",
        "install.sh",
        "install.ps1",
    ):
        source = ROOT / name
        target = tmp_path / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(source.read_bytes())
    path = tmp_path / "frontend/package.json"
    value = json.loads(path.read_text())
    value["version"] = "0.1.1"
    path.write_text(json.dumps(value))
    with pytest.raises(ValueError, match="mirrors"):
        release.check(tmp_path)


def test_exact_commit_increment_accepts_legacy_transition_and_rejects_repeats(monkeypatch):
    import subprocess

    base = "a" * 40
    monkeypatch.setattr(
        subprocess, "check_output", lambda *args, **kwargs: '[project]\nversion = "0.4.0rc6"\n'
    )
    assert str(release.check(ROOT, base)) == "0.4.1"
    monkeypatch.setattr(
        subprocess, "check_output", lambda *args, **kwargs: '[project]\nversion = "0.4.1"\n'
    )
    with pytest.raises(ValueError, match="Each publication"):
        release.check(ROOT, base)


def test_skipped_versions_are_rejected(monkeypatch):
    import subprocess

    monkeypatch.setattr(
        subprocess, "check_output", lambda *args, **kwargs: '[project]\nversion = "0.3.99"\n'
    )
    with pytest.raises(ValueError, match="Each publication"):
        release.check(ROOT, "a" * 40)
