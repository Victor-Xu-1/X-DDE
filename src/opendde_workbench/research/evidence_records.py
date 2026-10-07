"""Experimental evidence uses the existing Store and immutable AssetStore."""

import hashlib
from uuid import UUID, uuid5

from ..store import ConflictError, now
from .evidence_contracts import EvidenceDocument
from .evidence_parse import MAX_BYTES, parse_observations
from .storage import ScientificStore

NAMESPACE = UUID("a84f2ca7-00bc-4f97-ac4d-6dac6118840a")


class EvidenceRecords:
    def __init__(self, store, assets):
        self.store, self.assets = store, assets
        self.scientific = ScientificStore(store, assets)
        with store.connect() as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS research_evidence ("
                "id TEXT PRIMARY KEY,source_asset TEXT NOT NULL,parent_id TEXT,"
                "request_hash TEXT NOT NULL,body TEXT NOT NULL,sha256 TEXT NOT NULL,"
                "created_at TEXT NOT NULL)"
            )
            db.execute(
                "CREATE INDEX IF NOT EXISTS evidence_source ON research_evidence(source_asset)"
            )

    def source(self, request):
        asset = self.assets.get(request.source.asset_id)
        if (
            asset.kind != "measurements"
            or asset.suffix != ".csv"
            or asset.sha256 != request.source.sha256
        ):
            raise ValueError("Select the exact uploaded experimental CSV table.")
        if not 0 < asset.size <= MAX_BYTES:
            raise ValueError("Experimental table exceeds the bounded parsing budget.")
        content = self.assets.path(asset).read_bytes()
        if len(content) != asset.size or hashlib.sha256(content).hexdigest() != asset.sha256:
            raise ValueError("The immutable experimental input failed integrity verification.")
        verified_assets = set()
        linked_bytes = 0
        for reference in request.compound_links.values():
            if not reference.version_id:
                raise ValueError("Compound links require an exact saved scientific version.")
            self.scientific.validate_reference(reference)
            linked = self.assets.get(reference.asset_id)
            if (
                linked.kind not in {"ligand", "sequences", "structure"}
                or linked.sha256 != reference.sha256
            ):
                raise ValueError("The linked compound or biological material changed.")
            if linked.id not in verified_assets:
                linked_bytes += linked.size
                if linked_bytes > 256 * 1024**2 or len(verified_assets) >= 64:
                    raise ValueError(
                        "Linked materials exceed this import's file verification budget."
                    )
                with self.assets.path(linked).open("rb") as stream:
                    if hashlib.file_digest(stream, "sha256").hexdigest() != reference.sha256:
                        raise ValueError("The linked material failed integrity verification.")
                verified_assets.add(linked.id)
        return content

    @staticmethod
    def decode(row):
        if hashlib.sha256(row["body"].encode()).hexdigest() != row["sha256"]:
            raise ValueError("The experimental record failed integrity verification.")
        value = EvidenceDocument.model_validate_json(row["body"])
        if (str(value.id), str(value.request.source.asset_id)) != (row["id"], row["source_asset"]):
            raise ValueError("Experimental record identity differs from its source.")
        if (
            hashlib.sha256(value.request.model_dump_json().encode()).hexdigest()
            != row["request_hash"]
        ):
            raise ValueError("Experimental request identity changed.")
        return value

    def preview(self, request):
        rows = parse_observations(self.source(request), request)
        kinds = {
            key: self.scientific.get(ref.version_id).kind
            for key, ref in request.compound_links.items()
        }
        return tuple(
            row.model_copy(update={"material_kind": kinds.get(row.compound)}) for row in rows
        )

    def save(self, request, key):
        identifier = str(uuid5(NAMESPACE, str(key)))
        request_hash = hashlib.sha256(request.model_dump_json().encode()).hexdigest()
        with self.store.connect() as db:
            previous = db.execute(
                "SELECT * FROM research_evidence WHERE id=?", (identifier,)
            ).fetchone()
        if previous:
            if previous["request_hash"] != request_hash:
                raise ConflictError(
                    "This import key already identifies different experimental evidence."
                )
            value = self.decode(previous)
            self.source(value.request)
            return value
        observations = self.preview(request)
        if request.parent_id:
            parent = self.get(request.parent_id)
            if parent.request.source.asset_id != request.source.asset_id:
                raise ValueError(
                    "A revised annotation retains the same original experimental file."
                )
        value = EvidenceDocument(
            id=identifier,
            request=request,
            observations=observations,
            source_sha256=request.source.sha256,
            created_at=now(),
        )
        body = value.model_dump_json()
        with self.store.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            # Revalidate files and their saved versions under the same deletion/insert boundary.
            self.source(request)
            previous = db.execute(
                "SELECT * FROM research_evidence WHERE id=?", (identifier,)
            ).fetchone()
            if previous:
                if previous["request_hash"] != request_hash:
                    raise ConflictError(
                        "This import key identifies different experimental evidence."
                    )
                return self.decode(previous)
            db.execute(
                "INSERT INTO research_evidence VALUES(?,?,?,?,?,?,?)",
                (
                    identifier,
                    str(request.source.asset_id),
                    str(request.parent_id) if request.parent_id else None,
                    request_hash,
                    body,
                    hashlib.sha256(body.encode()).hexdigest(),
                    value.created_at,
                ),
            )
        return value

    def get(self, identifier):
        with self.store.connect() as db:
            row = db.execute(
                "SELECT * FROM research_evidence WHERE id=?", (str(identifier),)
            ).fetchone()
        if row is None:
            raise KeyError("Experimental evidence was not found.")
        value = self.decode(row)
        self.source(value.request)
        return value

    def list(self, limit=100, offset=0):
        with self.store.connect() as db:
            rows = db.execute(
                "SELECT * FROM research_evidence ORDER BY created_at DESC,id LIMIT ? OFFSET ?",
                (limit, offset),
            ).fetchall()
        return [self.decode(row) for row in rows]
