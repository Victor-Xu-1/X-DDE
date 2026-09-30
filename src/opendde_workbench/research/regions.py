"""Logical regions retain the full molecular graph and exact parser identities."""

import hashlib
from typing import Annotated, Literal, Self
from uuid import UUID, uuid5

from pydantic import ConfigDict, Field, model_validator

from ..artifacts import contained
from ..scientific_objects import MoleculeRef, ScientificModel
from ..store import ConflictError, now

NAMESPACE = UUID("f892b7e3-7708-4f18-af23-96c5039c8400")
REGION_ROLES = (
    {
        "id": "fixed_core",
        "label": ("固定核心", "Fixed core"),
        "help": (
            "局部重设计中保持的原子。只有显式提交固定原子才会影响生成。",
            "Atoms retained in inpainting; generation changes only when fixed atoms are submitted.",
        ),
    },
    {
        "id": "binder_a",
        "label": ("结合端 A", "Binder A"),
        "help": (
            "标记第一结合端；区域标签本身不证明结合。",
            "Annotate the first binder; a label does not prove binding.",
        ),
    },
    {
        "id": "binder_b",
        "label": ("结合端 B", "Binder B"),
        "help": (
            "标记第二结合端；可与其他区域重叠。",
            "Annotate the second binder; regions may overlap.",
        ),
    },
    {
        "id": "linker",
        "label": ("连接区", "Linker"),
        "help": (
            "完整分子中连接各端的逻辑区域，不切断键。",
            "A logical connecting region in the full molecule; no bonds are cut.",
        ),
    },
    {
        "id": "payload",
        "label": ("载荷", "Payload"),
        "help": (
            "标记载荷部分，保持完整分子与原始文件。",
            "Annotate a payload while retaining the full molecule and file.",
        ),
    },
    {
        "id": "custom",
        "label": ("自定义区域", "Custom region"),
        "help": ("命名一个需要复用的原子集合。", "Name an atom selection for reuse."),
    },
)


class Region(ScientificModel):
    name: str = Field(min_length=1, max_length=80, pattern=r"^[^\x00-\x1f]+$")
    role: Literal["fixed_core", "binder_a", "binder_b", "linker", "payload", "custom"]
    atom_indices: tuple[Annotated[int, Field(strict=True, ge=0, le=4999)], ...] = Field(
        min_length=1, max_length=5000
    )

    @model_validator(mode="after")
    def valid_indices(self) -> Self:
        if len(set(self.atom_indices)) != len(self.atom_indices) or any(
            i < 0 for i in self.atom_indices
        ):
            raise ValueError("Region atom indices must be nonnegative and unique.")
        return self


class RegionInput(ScientificModel):
    name: str = Field(min_length=1, max_length=120, pattern=r"^[^\x00-\x1f]+$")
    subject: MoleculeRef
    identity_job: UUID
    parent_id: UUID | None = None
    regions: tuple[Region, ...] = Field(min_length=1, max_length=20)

    @model_validator(mode="after")
    def unique_regions(self) -> Self:
        if not self.name.strip() or any(not region.name.strip() for region in self.regions):
            raise ValueError("Selection and region names must not be blank.")
        if len({region.name.strip() for region in self.regions}) != len(self.regions):
            raise ValueError("Region names must be unique; atom membership may overlap.")
        return self


class NativeAtom(ScientificModel):
    index: int = Field(strict=True, ge=0, le=4999)
    element: str = Field(pattern=r"^[A-Z][a-z]?$", max_length=2)
    selectable: bool = Field(strict=True)


class NativeIdentity(ScientificModel):
    # Parse only the public identity fields; the result also retains native provenance.
    model_config = ConfigDict(extra="ignore", frozen=True)
    mode: Literal["identity"]
    complete: Literal[True]
    identity_basis: Literal["rdkit_removeHs_record_order"]
    reference: MoleculeRef
    atoms: tuple[NativeAtom, ...] = Field(min_length=1, max_length=5000)

    @model_validator(mode="after")
    def ordered_atoms(self) -> Self:
        if [atom.index for atom in self.atoms] != list(range(len(self.atoms))):
            raise ValueError("Native atom manifest must retain exact consecutive parser order.")
        return self


class RegionRecords:
    def __init__(self, store, assets, settings):
        self.store, self.assets, self.settings = store, assets, settings
        with store.connect() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS research_regions (
                id TEXT PRIMARY KEY, body TEXT NOT NULL, sha256 TEXT NOT NULL,
                created_at TEXT NOT NULL)""")

    def validate(self, value):
        from .storage import ScientificStore

        asset = self.assets.get(value.subject.asset_id)
        if asset.kind != "ligand" or asset.suffix != ".sdf":
            raise ValueError("Native atom regions require an SDF molecular asset.")
        path = self.assets.path(asset)
        if (
            asset.sha256 != value.subject.sha256
            or hashlib.sha256(path.read_bytes()).hexdigest() != asset.sha256
        ):
            raise ValueError("Region subject failed file integrity verification.")
        ScientificStore(self.store, self.assets).validate_reference(value.subject)
        job = self.store.get(str(value.identity_job))
        if (
            not job
            or job.status != "succeeded"
            or job.request.operation != "diffsbdd"
            or job.request.payload.mode != "identity"
        ):
            raise ValueError("Regions require a successful native molecular identity task.")
        if job.request.payload.molecule != value.subject:
            raise ValueError("Identity task and region subject versions differ.")
        file = contained(self.settings.state_dir / "jobs" / job.id / "output", "result.json")
        if file.stat().st_size > 2 * 1024**2:
            raise ValueError("Identity result exceeds the bounded region manifest limit.")
        report = NativeIdentity.model_validate_json(file.read_text())
        if report.reference != value.subject:
            raise ValueError("Native atom identity subject does not match.")
        selectable = {atom.index for atom in report.atoms if atom.selectable}
        if any(
            index not in selectable for region in value.regions for index in region.atom_indices
        ):
            raise ValueError("A region atom is absent from the native selectable-atom manifest.")

    def save(self, value, key):
        self.validate(value)
        if value.parent_id:
            self.get(value.parent_id)
        body = value.model_dump_json()
        digest = hashlib.sha256(body.encode()).hexdigest()
        identifier = str(uuid5(NAMESPACE, str(key)))
        with self.store.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            if not db.execute(
                "SELECT 1 FROM assets WHERE id=? AND sha256=?",
                (str(value.subject.asset_id), value.subject.sha256),
            ).fetchone():
                raise ValueError("Region subject disappeared before saving. Select it again.")
            old = db.execute(
                "SELECT body,sha256 FROM research_regions WHERE id=?", (identifier,)
            ).fetchone()
            if old and hashlib.sha256(old["body"].encode()).hexdigest() != old["sha256"]:
                raise ValueError("Saved region document failed integrity verification.")
            if old and RegionInput.model_validate_json(old["body"]) != value:
                raise ConflictError(
                    "Region key already identifies a different immutable selection."
                )
            if not old:
                db.execute(
                    "INSERT INTO research_regions VALUES(?,?,?,?)",
                    (identifier, body, digest, now()),
                )
        return self.get(identifier)

    def get(self, identifier):
        with self.store.connect() as db:
            row = db.execute(
                "SELECT * FROM research_regions WHERE id=?", (str(identifier),)
            ).fetchone()
        if not row:
            raise KeyError("Saved molecular regions not found.")
        if hashlib.sha256(row["body"].encode()).hexdigest() != row["sha256"]:
            raise ValueError("Saved region document failed integrity verification.")
        return {
            **dict(row),
            "body": RegionInput.model_validate_json(row["body"]).model_dump(mode="json"),
        }

    def list(self, limit=100, offset=0, subject=None):
        filters, parameters = [], []
        if subject:
            for field, val in subject.model_dump(mode="json").items():
                filters.append("json_extract(body,'$.subject." + field + "') IS ?")
                parameters.append(val)
        where = " WHERE " + " AND ".join(filters) if filters else ""
        with self.store.connect() as db:
            ids = [
                r[0]
                for r in db.execute(
                    "SELECT id FROM research_regions"
                    + where
                    + " ORDER BY created_at DESC,id LIMIT ? OFFSET ?",
                    (*parameters, limit, offset),
                )
            ]
        return [self.get(identifier) for identifier in ids]

    def check_task(self, request):
        identifier = getattr(request.payload, "saved_regions", None)
        if not identifier:
            return
        try:
            value = RegionInput.model_validate(self.get(identifier)["body"])
        except KeyError as exc:
            raise ValueError(
                "Saved fixed regions no longer exist. Select or save them again."
            ) from exc
        if request.payload.mode != "inpaint" or request.payload.initial != value.subject:
            raise ValueError("Saved fixed regions require inpainting of the exact input version.")
        indices = sorted(
            {
                i
                for region in value.regions
                if region.role == "fixed_core"
                for i in region.atom_indices
            }
        )
        if not indices or request.payload.options.fixed_atoms != indices:
            raise ValueError("Saved fixed regions and the submitted fixed atoms do not agree.")
