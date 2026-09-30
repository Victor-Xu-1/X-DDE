"""Constraint assets share SQLite and reference/region authorities with all research data."""

import hashlib
from uuid import UUID, uuid5

from ..store import ConflictError, now
from .constraint_compile import compile_constraints
from .constraint_contract import ConstraintReference, ConstraintSet
from .regions import RegionInput, RegionRecords
from .storage import ScientificStore

NAMESPACE = UUID("ef3d92c7-03c5-42de-a9d8-f69d7f434e71")


class ConstraintRecords:
    def __init__(self, store, assets, settings):
        self.store, self.assets = store, assets
        self.regions = RegionRecords(store, assets, settings)
        self.scientific = ScientificStore(store, assets)
        with store.connect() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS research_constraints (
                id TEXT PRIMARY KEY, body TEXT NOT NULL, sha256 TEXT NOT NULL,
                created_at TEXT NOT NULL)""")

    def validate(self, value):
        self.scientific.validate_reference(value.subject)
        asset = self.assets.get(value.subject.asset_id)
        if asset.kind != "ligand" or asset.suffix != ".sdf":
            raise ValueError("Constraint subjects require an exact SDF molecular asset.")
        refs = [value.subject]
        if value.frame:
            self.scientific.validate_reference(value.frame.reference)
            frame_asset = self.assets.get(value.frame.reference.asset_id)
            if frame_asset.kind != "structure" or frame_asset.suffix != ".pdb":
                raise ValueError("Coordinate frames require an explicit PDB structure version.")
            if value.frame.reference.record or value.frame.reference.conformer:
                raise ValueError("Select one explicit receptor model for a coordinate frame.")
            refs.append(value.frame.reference)
        for ref in refs:
            asset = self.assets.get(ref.asset_id)
            if hashlib.sha256(self.assets.path(asset).read_bytes()).hexdigest() != ref.sha256:
                raise ValueError("Constraint asset failed file integrity verification.")
        for condition in value.conditions:
            if condition.kind == "fixed_region":
                selection = RegionInput.model_validate(
                    self.regions.get(condition.region_id)["body"]
                )
                self.regions.validate(selection)
                if selection.subject != value.subject:
                    raise ValueError(
                        "Region and constraint subjects must be the same exact version."
                    )
                if not any(r.name == condition.region_name for r in selection.regions):
                    raise ValueError("Named region is not present in the saved selection.")
        if value.parent_id:
            parent = ConstraintSet.model_validate(self.get(value.parent_id)["body"])
            if parent.subject != value.subject:
                raise ValueError(
                    "Revision must retain its exact subject; "
                    "new versions need a newly confirmed selection."
                )

    def save(self, value, key):
        self.validate(value)
        body = value.model_dump_json()
        digest = hashlib.sha256(body.encode()).hexdigest()
        identifier = str(uuid5(NAMESPACE, str(key)))
        with self.store.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            for ref in [value.subject] + ([value.frame.reference] if value.frame else []):
                if not db.execute(
                    "SELECT 1 FROM assets WHERE id=? AND sha256=?", (str(ref.asset_id), ref.sha256)
                ).fetchone():
                    raise ValueError("Constraint input disappeared before saving. Select it again.")
            old = db.execute(
                "SELECT * FROM research_constraints WHERE id=?", (identifier,)
            ).fetchone()
            if old:
                if hashlib.sha256(old["body"].encode()).hexdigest() != old["sha256"]:
                    raise ValueError("Saved constraint document failed integrity verification.")
                if ConstraintSet.model_validate_json(old["body"]) != value:
                    raise ConflictError(
                        "Constraint key already identifies a different immutable revision."
                    )
            else:
                db.execute(
                    "INSERT INTO research_constraints VALUES(?,?,?,?)",
                    (identifier, body, digest, now()),
                )
        return self.get(identifier)

    def get(self, identifier):
        with self.store.connect() as db:
            row = db.execute(
                "SELECT * FROM research_constraints WHERE id=?", (str(identifier),)
            ).fetchone()
        if not row:
            raise KeyError("Saved constraint set not found.")
        if hashlib.sha256(row["body"].encode()).hexdigest() != row["sha256"]:
            raise ValueError("Saved constraint document failed integrity verification.")
        return {
            **dict(row),
            "body": ConstraintSet.model_validate_json(row["body"]).model_dump(mode="json"),
        }

    def list(self, limit=100, offset=0, subject=None):
        clauses, params = [], []
        if subject:
            for field, val in subject.model_dump(mode="json").items():
                clauses.append("json_extract(body,'$.subject." + field + "') IS ?")
                params.append(val)
        where = " WHERE " + " AND ".join(clauses) if clauses else ""
        with self.store.connect() as db:
            ids = [
                r[0]
                for r in db.execute(
                    "SELECT id FROM research_constraints"
                    + where
                    + " ORDER BY created_at DESC,id LIMIT ? OFFSET ?",
                    (*params, limit, offset),
                )
            ]
        return [self.get(i) for i in ids]

    def preview(self, reference: ConstraintReference, request):
        saved = self.get(reference.id)
        if saved["sha256"] != reference.sha256:
            raise ValueError("Constraint reference digest differs from its immutable document.")
        value = ConstraintSet.model_validate(saved["body"])
        self.validate(value)
        return compile_constraints(value, reference, request, self.regions)

    def check_task(self, request):
        reference = getattr(request, "constraints", None)
        if not reference:
            return None
        try:
            result = self.preview(reference, request)
        except KeyError as exc:
            raise ValueError(
                "Saved constraints or their referenced selections no longer exist."
            ) from exc
        if not result.executable:
            raise ValueError(
                "Constraints cannot be executed: "
                + "; ".join(c.reason for c in result.conditions if not c.supported)
            )
        return result
