"""Real ZIP, queue, AssetStore and HTTP boundaries; never fake chemical/stock validity."""

import hashlib
import io
import zipfile
from uuid import uuid4

import pytest

from opendde_workbench.assets import AssetStore
from opendde_workbench.datasets import public_resources
from opendde_workbench.deployment import supplier_files
from opendde_workbench.deployment.manager import DeploymentManager
from opendde_workbench.store import Store


def protocol_archive():
    content = (
        b"\nTransfer framing only\n\n  0  0  0  0  0  0            999 V2000\nM  END\n"
        b"> <Cmpdid>\nsource-protocol-42\n\n$$$$\n"
    )
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w") as bundle:
        bundle.writestr("stock.sdf", content)
    resource = {
        "id": "source-protocol",
        "supplier": "bionet",
        "member": "stock.sdf",
        "filename": "supplier-protocol.sdf",
        "size": len(content),
        "sha256": hashlib.sha256(content).hexdigest(),
        "archive_sha256": hashlib.sha256(stream.getvalue()).hexdigest(),
        "url": "https://provider.invalid/protocol.zip",
        "label": ["传输协议", "Transfer protocol"],
        "raw_records": 1,
        "id_column": "Cmpdid",
        "source_page": "https://provider.invalid/",
        "scope": "protocol_only",
    }
    return content, stream.getvalue(), resource


def test_supplier_queue_registers_exact_assets_and_retains_them_after_uninstall(
    tmp_path, monkeypatch
):
    content, raw, resource = protocol_archive()
    manager = DeploymentManager(tmp_path / "state")
    manager.configure(str(tmp_path / "components"), False)
    monkeypatch.setattr(supplier_files, "RESOURCES", {resource["id"]: resource})
    monkeypatch.setattr(public_resources, "RESOURCES", {resource["id"]: resource})

    def transfer(url, target, checksum, report, checkpoint):
        assert checksum == resource["archive_sha256"]
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(raw)

    monkeypatch.setattr(supplier_files, "download", transfer)
    identifier = manager.enqueue("supplier-libraries", "install")[0]
    manager.tick()
    assert manager.store.get(identifier)["state"] == "succeeded"
    assets = AssetStore(Store(manager.store.state / "jobs.sqlite3"), manager.store.state / "assets")
    rows = public_resources.available_files(assets, manager.store.state)
    assert rows[0]["asset"] and not rows[0]["screening_index_ready"]
    asset = assets.get(rows[0]["asset"]["id"])
    assert assets.path(asset).read_bytes() == content
    identifier = manager.enqueue("supplier-libraries", "install")[0]
    manager.tick()
    assert manager.store.get(identifier)["state"] == "succeeded"
    assert len(assets.list()) == 1
    manager.enqueue("supplier-libraries", "uninstall")
    manager.tick()
    assert assets.path(asset).read_bytes() == content
    assert public_resources.available_files(assets, manager.store.state)[0]["asset"] is None


@pytest.mark.parametrize("member", ["../stock.sdf", "/stock.sdf", "C:/stock.sdf"])
def test_supplier_archive_rejects_unsafe_members(tmp_path, member):
    _, raw, resource = protocol_archive()
    archive = tmp_path / "source.zip"
    with zipfile.ZipFile(archive, "w") as bundle:
        bundle.writestr(member, raw)
    with pytest.raises(ValueError, match="unsafe"):
        supplier_files.extract_structure(archive, resource, tmp_path / "output.sdf", lambda: None)


def test_selected_sdf_supplier_property_is_available_without_chemical_execution(client_factory):
    content, _, _ = protocol_archive()
    with client_factory() as client:
        identifier = str(uuid4())
        response = client.post(
            "/api/assets/uploads",
            json={"name": "supplier.sdf", "kind": "library", "size": len(content)},
            headers={"Idempotency-Key": identifier},
        )
        assert response.status_code == 201
        assert (
            client.put(
                f"/api/assets/uploads/{identifier}?offset=0",
                content=content,
                headers={"X-Chunk-SHA256": hashlib.sha256(content).hexdigest()},
            ).status_code
            == 200
        )
        asset = client.post(f"/api/assets/uploads/{identifier}/complete").json()
        preview = client.get(f"/api/datasets/files/{asset['id']}/preview").json()
        assert preview["sdf_properties"] == ["Cmpdid"] and not preview["table"]
        assert all(
            not row["asset"] and not row["screening_index_ready"]
            for row in client.get("/api/datasets/public-files").json()
        )
