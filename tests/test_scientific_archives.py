"""Reviewed source tutorial aliases never become executable filesystem links."""

import zipfile

import pytest

from opendde_workbench.deployment.transfers import extract


def link_archive(tmp_path, target="../../upstream-config", duplicate=False):
    file = tmp_path / "source.zip"
    link = zipfile.ZipInfo("release/tutorial/config")
    link.create_system = 3
    link.external_attr = 0o120777 << 16
    with zipfile.ZipFile(file, "w") as bundle:
        bundle.writestr("release/native.py", "native source")
        bundle.writestr(link, target)
        if duplicate:
            second = zipfile.ZipInfo(link.filename)
            second.create_system = 3
            second.external_attr = link.external_attr
            with pytest.warns(UserWarning, match="Duplicate name"):
                bundle.writestr(second, target)
    return file


def test_reviewed_tutorial_alias_is_omitted_without_weakening_other_archives(tmp_path):
    archive = link_archive(tmp_path)
    allowed = {"release/tutorial/config": "../../upstream-config"}
    extract(archive, tmp_path / "reviewed", lambda: None, skipped_links=allowed)
    assert (tmp_path / "reviewed/release/native.py").read_text() == "native source"
    assert not (tmp_path / "reviewed/release/tutorial/config").exists()
    with pytest.raises(ValueError, match="symlinks"):
        extract(archive, tmp_path / "unreviewed", lambda: None)


def test_altered_or_duplicate_alias_still_fails(tmp_path):
    archive = link_archive(tmp_path, target="../../../outside")
    with pytest.raises(ValueError, match="symlinks"):
        extract(
            archive,
            tmp_path / "altered",
            lambda: None,
            skipped_links={"release/tutorial/config": "../../upstream-config"},
        )
    archive = link_archive(tmp_path, duplicate=True)
    with pytest.raises(ValueError, match="duplicate"):
        extract(
            archive,
            tmp_path / "duplicate",
            lambda: None,
            skipped_links={"release/tutorial/config": "../../upstream-config"},
        )
