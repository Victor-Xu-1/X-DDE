"""Text transport keeps valid Unicode, explicit source bytes and scientific identities."""

import hashlib
from uuid import NAMESPACE_URL, uuid5

import pytest

from opendde_workbench.asset_uploads import UploadInput, UploadStore
from opendde_workbench.assets import AssetStore
from opendde_workbench.datasets.source_text import normalize_text
from opendde_workbench.deployment.supplier_files import release_previous_upload
from opendde_workbench.store import Store


def document(value, field="Name"):
    return (
        b"\nTransfer only\n\n  0  0  0  0  0  0            999 V2000\nM  END\n"
        + b"> <"
        + field.encode()
        + b">\n"
        + value
        + b"\n\n> <ID>\noriginal-42\n\n$$$$\n"
    )


@pytest.mark.parametrize(
    "value,profile,expected",
    [
        ("λ⁶ · ".encode() + b"142\xb0C", {"legacy_properties": {"Name": "cp1252"}}, "λ⁶ · 142°C"),
        (
            b"***\xc7\xc0\xcf\xd0\xc5\xd9\xc5\xcd*** " + "²".encode(),
            {"legacy_properties": {"Name": "cp1251"}},
            "***ЗАПРЕЩЕН*** ²",
        ),
        (
            b"1,1\x92 X\xe1",
            {"legacy_properties": {"Name": "cp1252"}, "escaped_bytes": [225]},
            "1,1’ X\\xE1",
        ),
        (b"supplier-value\xff", {"escaped_bytes": [255]}, "supplier-value\\xFF"),
        (b"mixed\xe2\x80", {"escape_unreviewed_bytes": True}, "mixed\\xE2\\x80"),
    ],
)
def test_reviewed_text_keeps_existing_utf8_and_explicit_unresolved_bytes(
    tmp_path, value, profile, expected
):
    source, target = tmp_path / "source.sdf", tmp_path / "normalized.sdf"
    raw = document(value)
    source.write_bytes(raw)
    result = normalize_text(source, target, profile, "ID", lambda: None)
    normalized = target.read_bytes()
    assert source.read_bytes() == raw
    assert expected in normalized.decode("utf-8")
    assert b"> <ID>\noriginal-42\n" in normalized
    assert normalized.split(b"M  END")[0] == raw.split(b"M  END")[0]
    assert result["sha256"] == hashlib.sha256(normalized).hexdigest()


@pytest.mark.parametrize("field", ["ID", "atoms"])
def test_encoding_policy_cannot_modify_supplier_id_or_molecular_data(tmp_path, field):
    source, target = tmp_path / "source.sdf", tmp_path / "normalized.sdf"
    raw = (
        document(b"bad\xb0", "ID")
        if field == "ID"
        else document(b"label").replace(b"M  END", b"ATOM\xb0\nM  END")
    )
    source.write_bytes(raw)
    with pytest.raises(ValueError, match="atom/bond data or supplier IDs"):
        normalize_text(source, target, {"legacy_codepage": "cp1252"}, "ID", lambda: None)
    assert source.read_bytes() == raw


def test_text_policy_does_not_guess_a_legacy_encoding(tmp_path):
    source, target = tmp_path / "source.sdf", tmp_path / "normalized.sdf"
    source.write_bytes(document(b"140\xb0C"))
    with pytest.raises(ValueError, match="Unreviewed"):
        normalize_text(source, target, {}, "ID", lambda: None)


def test_repaired_input_releases_only_matching_installer_temporary_upload(tmp_path):
    assets = AssetStore(Store(tmp_path / "state/jobs.sqlite3"), tmp_path / "state/assets")
    uploads = UploadStore(assets, 1024**2, 1024**3, 0)
    raw = document(b"140\xb0C")
    source = tmp_path / "raw.sdf"
    source.write_bytes(raw)
    digest = hashlib.sha256(raw).hexdigest()
    identifier = uuid5(NAMESPACE_URL, "x-dde/supplier-file/" + digest)
    uploads.create(UploadInput(name="source.sdf", kind="library", size=len(raw)), identifier)
    uploads.append(identifier, 0, raw, digest)
    release_previous_upload(
        uploads,
        source,
        {
            "text_profile": {"legacy_codepage": "cp1252"},
            "source_sha256": digest,
            "source_filename": "source.sdf",
            "source_size": len(raw),
        },
        lambda: None,
    )
    assert uploads.get(identifier)["state"] == "cancelled"
    assert source.read_bytes() == raw
    assert not assets.list()


@pytest.mark.parametrize("mismatch", ["name", "bytes"])
def test_repair_preserves_other_uploads_or_changed_source_bytes(tmp_path, mismatch):
    assets = AssetStore(Store(tmp_path / "state/jobs.sqlite3"), tmp_path / "state/assets")
    uploads = UploadStore(assets, 1024**2, 1024**3, 0)
    raw = document(b"140\xb0C")
    source = tmp_path / "raw.sdf"
    source.write_bytes(raw)
    digest = hashlib.sha256(raw).hexdigest()
    identifier = uuid5(NAMESPACE_URL, "x-dde/supplier-file/" + digest)
    content = raw.replace(b"140", b"150") if mismatch == "bytes" else raw
    uploads.create(
        UploadInput(
            name="other.sdf" if mismatch == "name" else "source.sdf", kind="library", size=len(raw)
        ),
        identifier,
    )
    uploads.append(identifier, 0, content, hashlib.sha256(content).hexdigest())
    with pytest.raises(ValueError):
        release_previous_upload(
            uploads,
            source,
            {
                "text_profile": {"legacy_codepage": "cp1252"},
                "source_sha256": digest,
                "source_filename": "source.sdf",
                "source_size": len(raw),
            },
            lambda: None,
        )
    row = uploads.get(identifier)
    assert row["state"] == "uploading" and uploads.path(row).read_bytes() == content


def test_repair_preserves_already_registered_original_asset(tmp_path):
    assets = AssetStore(Store(tmp_path / "state/jobs.sqlite3"), tmp_path / "state/assets")
    uploads = UploadStore(assets, 1024**2, 1024**3, 0)
    raw = document("140°C".encode())
    source = tmp_path / "raw.sdf"
    source.write_bytes(raw)
    digest = hashlib.sha256(raw).hexdigest()
    identifier = uuid5(NAMESPACE_URL, "x-dde/supplier-file/" + digest)
    uploads.create(UploadInput(name="source.sdf", kind="library", size=len(raw)), identifier)
    uploads.append(identifier, 0, raw, digest)
    asset = uploads.finalize(identifier)
    release_previous_upload(
        uploads,
        source,
        {
            "text_profile": {"legacy_codepage": "cp1252"},
            "source_sha256": digest,
            "source_filename": "source.sdf",
            "source_size": len(raw),
        },
        lambda: None,
    )
    assert uploads.get(identifier)["state"] == "complete"
    assert assets.path(asset).read_bytes() == raw
