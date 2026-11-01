"""Keep mirror repair bounded and preserve repository signature verification."""

import runpy

import pytest

module = runpy.run_path("scripts/ci-browser-network.py")


def test_only_the_known_mirror_changes_in_both_source_formats(tmp_path):
    sources = tmp_path / "sources.list.d"
    sources.mkdir()
    deb822 = sources / "ubuntu.sources"
    original = "URIs: http://azure.archive.ubuntu.com/ubuntu/\nSigned-By: /keys/ubuntu.gpg\n"
    deb822.write_text(original)
    classic = tmp_path / "sources.list"
    classic.write_text("deb https://azure.archive.ubuntu.com/ubuntu noble main\n")
    unrelated = sources / "vendor.list"
    vendor = "deb https://vendor.example/ubuntu noble main\n"
    unrelated.write_text(vendor)
    assert module["configure"](tmp_path) == 2
    assert deb822.read_text() == original.replace(
        "http://azure.archive.ubuntu.com", "https://archive.ubuntu.com"
    )
    assert unrelated.read_text() == vendor
    assert "Signed-By: /keys/ubuntu.gpg" in deb822.read_text()
    assert module["configure"](tmp_path) == 0
    assert (tmp_path / "apt.conf.d/99-xdde-browser-ci").read_text() == module["NETWORK"]


def test_existing_unknown_network_policy_is_preserved(tmp_path):
    folder = tmp_path / "apt.conf.d"
    folder.mkdir()
    policy = folder / "99-xdde-browser-ci"
    policy.write_text("Existing owner policy\n")
    source = tmp_path / "sources.list"
    source_text = "deb http://azure.archive.ubuntu.com/ubuntu noble main\n"
    source.write_text(source_text)
    with pytest.raises(ValueError, match="Preserve unknown"):
        module["configure"](tmp_path)
    assert policy.read_text() == "Existing owner policy\n"
    assert source.read_text() == source_text


def test_runner_mirror_list_preserves_source_signatures_and_other_entries(tmp_path):
    sources = tmp_path / "sources.list.d"
    sources.mkdir()
    source = sources / "ubuntu.sources"
    source_text = (
        "URIs: mirror+file:/etc/apt/apt-mirrors.txt\n"
        "Suites: noble noble-updates noble-backports noble-security\n"
        "Components: main restricted universe multiverse\n"
        "Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n"
    )
    source.write_text(source_text)
    mirrors = tmp_path / "apt-mirrors.txt"
    mirrors.write_text(
        "http://azure.archive.ubuntu.com/ubuntu\tpriority:1\n"
        "https://archive.ubuntu.com/ubuntu\tpriority:2\n"
        "https://vendor.example/ubuntu\tpriority:3\n"
    )
    assert module["configure"](tmp_path) == 1
    assert source.read_text() == source_text
    assert mirrors.read_text() == (
        "https://archive.ubuntu.com/ubuntu\tpriority:1\n"
        "https://archive.ubuntu.com/ubuntu\tpriority:2\n"
        "https://vendor.example/ubuntu\tpriority:3\n"
    )
    assert module["configure"](tmp_path) == 0


def test_entry_cannot_modify_an_owner_machine(monkeypatch):
    monkeypatch.delenv("GITHUB_ACTIONS", raising=False)
    with pytest.raises(RuntimeError, match="isolated Actions"):
        module["main"]()
