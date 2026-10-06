"""Versioned environment metadata; provider identity is separate from scientific software.

This is an immutable metadata binding, not a claim that operator-managed files or
weights are frozen. Native result provenance and target-server acceptance remain required.
"""

import hashlib
import json
from pathlib import Path
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .deployment.catalog import PACKAGES
from .engine_registry import ENGINES
from .locations import read_json
from .settings import Settings


def snapshot_digest(body: dict) -> str:
    return hashlib.sha256(
        json.dumps(body, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


class ProvisioningReference(BaseModel):
    model_config = ConfigDict(extra="forbid")
    engine: str
    implementation: str
    version: str
    deployment_operation: str


class EnvironmentComponent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    package: str
    version: str
    prepared_by: ProvisioningReference | None = None


class EnvironmentSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scientific_software: str
    execution_backend: Literal["docker", "local_process", "harness_process"]
    runtime: dict[str, str]
    components: list[EnvironmentComponent]


class EnvironmentRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schema_version: Literal[1] = 1
    snapshot_sha256: str = Field(pattern="^[a-f0-9]{64}$")
    specification: EnvironmentSpec
    verification: Literal["installation_metadata_only"] = "installation_metadata_only"
    origin_note: str

    @model_validator(mode="after")
    def verify_snapshot(self) -> Self:
        body = self.model_dump(mode="json", exclude={"snapshot_sha256"})
        digest = snapshot_digest(body)
        if digest != self.snapshot_sha256:
            raise ValueError("Environment metadata snapshot failed integrity verification.")
        return self


def capture(settings: Settings, software: str) -> EnvironmentRecord:
    definition = ENGINES[software]
    config = read_json(settings.state_dir / "deployment.json")
    installed = read_json(Path(config["root"]) / "installed.json") if config else {}
    if software == "discovery":
        import sys

        from .discovery.sources import ENDPOINT

        runtime = {
            "python": sys.version.split()[0],
            "open_targets_endpoint": ENDPOINT,
            "uniprot_endpoint": "https://rest.uniprot.org",
            "chembl_endpoint": "https://www.ebi.ac.uk/chembl/api/data",
        }
        matched = False
    elif software in {
        "boltz",
        "reinvent",
        "ligandmpnn",
        "boltzgen",
        "openmm",
        "apbs",
        "chemprop",
        "plip",
        "drugclip",
        "deli",
    }:
        from .integrations.specs import recipe_digest

        entry = installed.get(software, {})
        models = installed.get(software + "-models", {})
        runtime = {
            "image": entry.get("image", ""),
            "recipe_sha256": recipe_digest(software),
            "models": models.get("models", ""),
            "model_manifest_sha256": models.get("manifest_sha256", ""),
        }
        matched = bool(runtime["image"] and entry.get("recipe_sha256") == runtime["recipe_sha256"])
    elif software == "opendde":
        runtime = {
            "image": settings.image_file.read_text().strip()
            if settings.image_file.is_file()
            else "",
            "code": settings.code_file.read_text().strip() if settings.code_file.is_file() else "",
            "models": str(settings.model_dir),
        }
        matched = installed.get("compute", {}).get("image") == runtime["image"] and bool(
            runtime["image"]
        )
        matched = matched and installed.get("runtime", {}).get("code") == runtime["code"]
    elif software == "sapiens":
        from .humanization.image import lock_digest
        from .humanization.manifest import METADATA_DIGEST

        runtime = {
            "image": settings.sapiens_image or "",
            "runtime_lock_sha256": lock_digest(),
            "reference_metadata_sha256": METADATA_DIGEST,
        }
        matched = bool(
            runtime["image"] and installed.get("sapiens", {}).get("image") == runtime["image"]
        )
    elif software == "admet":
        from .admet.image import lock_digest
        from .admet.manifest import METADATA_DIGEST

        runtime = {
            "image": settings.admet_image or "",
            "runtime_lock_sha256": lock_digest(),
            "endpoint_metadata_sha256": METADATA_DIGEST,
        }
        matched = bool(
            runtime["image"] and installed.get("admet", {}).get("image") == runtime["image"]
        )
    elif software == "posebusters":
        from .quality.image import lock_digest

        runtime = {"image": settings.posebusters_image or "", "runtime_lock_sha256": lock_digest()}
        matched = bool(
            runtime["image"] and installed.get("posebusters", {}).get("image") == runtime["image"]
        )
    elif software == "anarcii":
        from .antibodies.image import lock_digest

        runtime = {"image": settings.anarcii_image or "", "runtime_lock_sha256": lock_digest()}
        matched = bool(
            runtime["image"] and installed.get("anarcii", {}).get("image") == runtime["image"]
        )
    elif software == "biopython":
        from .receptors.image import lock_digest

        runtime = {"image": settings.biopython_image or "", "runtime_lock_sha256": lock_digest()}
        matched = bool(
            runtime["image"] and installed.get("biopython", {}).get("image") == runtime["image"]
        )
    elif software == "chemistry":
        from .chemistry.image import lock_digest

        runtime = {"image": settings.chemistry_image or "", "runtime_lock_sha256": lock_digest()}
        matched = bool(
            runtime["image"] and installed.get("chemistry", {}).get("image") == runtime["image"]
        )
    elif software == "gnina":
        from .docking.image import lock_digest
        from .docking.manifest import BINARY_SHA256

        runtime = {
            "image": settings.gnina_image or "",
            "binary_sha256": BINARY_SHA256,
            "runtime_lock_sha256": lock_digest(),
        }
        matched = bool(
            runtime["image"] and installed.get("gnina", {}).get("image") == runtime["image"]
        )
    elif software == "p2rank":
        runtime = {
            "source": str(settings.p2rank_home or ""),
            "image": settings.p2rank_image or "",
            "manifest_sha256": settings.p2rank_manifest_sha256 or "",
        }
        matched = (
            bool(runtime["source"])
            and installed.get("p2rank", {}).get("source") == runtime["source"]
        )
        matched = matched and installed.get("p2rank-compute", {}).get("image") == runtime["image"]
    elif software == "diffsbdd":
        runtime = {
            "python": str(settings.diffsbdd_python or ""),
            "source": str(settings.diffsbdd_source or ""),
            "home": str(settings.diffsbdd_home or ""),
            "manifest_sha256": settings.diffsbdd_manifest_sha256 or "",
        }
        entry = installed.get("diffsbdd", {})
        matched = (
            all(
                entry.get(key) == value and value for key, value in runtime.items() if key != "home"
            )
            and entry.get("runtime") == runtime["home"]
        )
    else:
        runtime = {"python": str(settings.harness_python or "")}
        matched = bool(
            runtime["python"] and installed.get("harness", {}).get("python") == runtime["python"]
        )
    components = []
    if matched:
        for key, entry in sorted(installed.items()):
            if key in PACKAGES and PACKAGES[key].engine == software:
                if (
                    key in {"standard", "abag"}
                    and str(Path(entry.get("models", "")) / "opendde") != runtime["models"]
                ):
                    continue
                components.append(
                    EnvironmentComponent(
                        package=key, version=entry["version"], prepared_by=entry.get("provisioning")
                    )
                )
    spec = EnvironmentSpec(
        scientific_software=software,
        execution_backend=definition.execution_backend,
        runtime=runtime,
        components=components,
    )
    note = (
        "Managed installation metadata; legacy entries may lack provisioning origin."
        if matched
        else "Operator-configured environment; provisioning origin is not asserted."
    )
    body = {
        "schema_version": 1,
        "specification": spec.model_dump(mode="json"),
        "verification": "installation_metadata_only",
        "origin_note": note,
    }
    digest = snapshot_digest(body)
    return EnvironmentRecord(snapshot_sha256=digest, **body)
