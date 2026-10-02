"""Host configuration is separate from the public source tree."""

import os
from dataclasses import dataclass, field
from pathlib import Path

from .locations import home, read_json


@dataclass(frozen=True)
class Settings:
    state_dir: Path
    image_file: Path
    code_file: Path
    model_dir: Path
    cache_dir: Path
    capacity_dir: Path | None = None
    allowed_origins: tuple[str, ...] = ("http://127.0.0.1:4320", "http://localhost:4320")
    job_timeout: int = 7200
    max_pending: int = 20
    log_limit: int = 8 * 1024 * 1024
    max_jobs: int = 500
    minimum_free_bytes: int = 2 * 1024**3
    msa_url: str | None = None
    harness_python: Path | None = None
    harness_shared_dir: Path | None = None
    harness_remote_dir: str | None = None
    harness_url: str | None = None
    harness_token: str | None = field(default=None, repr=False)
    checkpoints_file: Path | None = None
    diffsbdd_python: Path | None = None
    diffsbdd_source: Path | None = None
    diffsbdd_home: Path | None = None
    diffsbdd_manifest_sha256: str | None = None
    chemistry_image: str | None = None
    biopython_image: str | None = None
    posebusters_image: str | None = None
    anarcii_image: str | None = None
    gnina_image: str | None = None
    p2rank_home: Path | None = None
    p2rank_image: str | None = None
    p2rank_manifest_sha256: str | None = None
    admet_image: str | None = None
    sapiens_image: str | None = None
    native_tools_dir: Path | None = None
    engine_network: str = "bridge"

    @classmethod
    def from_env(cls):
        def path(key: str, default: str) -> Path:
            return Path(os.environ.get(key, default)).expanduser().resolve()

        def interpreter(key: str, default: str) -> Path:
            # Python discovers a virtual environment from the invoked executable path.
            # Resolving its symlink selects the base interpreter and loses installed packages.
            return Path(os.environ.get(key, default)).expanduser().absolute()

        state = path("WB_STATE_DIR", str(home() / "state"))
        deployment = read_json(state / "deployment.json")
        root = Path(deployment["root"]) if deployment else None
        installed = read_json(root / "installed.json") if root else {}
        references = state / "managed-references"
        references.mkdir(parents=True, exist_ok=True)
        for key, attribute in (("compute", "image"), ("runtime", "code")):
            if key in installed:
                (references / attribute).write_text(installed[key][attribute])
            else:
                (references / attribute).unlink(missing_ok=True)
        harness = installed.get("harness", {}).get("python")
        diff = installed.get("diffsbdd", {})
        pockets = installed.get("p2rank", {})
        network = os.environ.get("WB_ENGINE_NETWORK", "bridge")
        if network not in {"bridge", "host"}:
            raise ValueError("WB_ENGINE_NETWORK must be bridge or host.")
        tools = installed.get("opendde-tools", {}).get("directory")
        return cls(
            engine_network=network,
            native_tools_dir=path("WB_NATIVE_TOOLS_DIR", tools or "")
            if os.environ.get("WB_NATIVE_TOOLS_DIR") or tools
            else None,
            sapiens_image=os.environ.get("WB_SAPIENS_IMAGE")
            or installed.get("sapiens", {}).get("image"),
            admet_image=os.environ.get("WB_ADMET_IMAGE") or installed.get("admet", {}).get("image"),
            posebusters_image=os.environ.get("WB_POSEBUSTERS_IMAGE")
            or installed.get("posebusters", {}).get("image"),
            anarcii_image=os.environ.get("WB_ANARCII_IMAGE")
            or installed.get("anarcii", {}).get("image"),
            biopython_image=os.environ.get("WB_BIOPYTHON_IMAGE")
            or installed.get("biopython", {}).get("image"),
            chemistry_image=os.environ.get("WB_CHEMISTRY_IMAGE")
            or installed.get("chemistry", {}).get("image"),
            gnina_image=os.environ.get("WB_GNINA_IMAGE") or installed.get("gnina", {}).get("image"),
            p2rank_home=path("WB_P2RANK_HOME", pockets.get("source", ""))
            if os.environ.get("WB_P2RANK_HOME") or pockets.get("source")
            else None,
            p2rank_image=os.environ.get("WB_P2RANK_IMAGE")
            or installed.get("p2rank-compute", {}).get("image"),
            p2rank_manifest_sha256=os.environ.get("WB_P2RANK_MANIFEST_SHA256")
            or pockets.get("manifest_sha256"),
            diffsbdd_python=interpreter("WB_DIFFSBDD_PYTHON", diff.get("python", ""))
            if os.environ.get("WB_DIFFSBDD_PYTHON") or diff.get("python")
            else None,
            diffsbdd_source=path("WB_DIFFSBDD_SOURCE", diff.get("source", ""))
            if os.environ.get("WB_DIFFSBDD_SOURCE") or diff.get("source")
            else None,
            diffsbdd_home=path("WB_DIFFSBDD_HOME", diff.get("runtime", ""))
            if os.environ.get("WB_DIFFSBDD_HOME") or diff.get("runtime")
            else None,
            diffsbdd_manifest_sha256=os.environ.get("WB_DIFFSBDD_MANIFEST_SHA256")
            or diff.get("manifest_sha256"),
            state_dir=state,
            image_file=path(
                "WB_IMAGE_FILE",
                str(references / "image") if deployment else "/opt/opendde/image-reference.txt",
            ),
            code_file=path(
                "WB_CODE_FILE",
                str(references / "code")
                if deployment
                else "/opt/opendde/runtime-code-reference.txt",
            ),
            model_dir=path(
                "WB_MODEL_DIR",
                str(root / "models/opendde") if root else "/opt/opendde/data/opendde",
            ),
            cache_dir=path("WB_CACHE_DIR", str(state / "cache")),
            capacity_dir=path("WB_CAPACITY_DIR", str(state)),
            msa_url=os.environ.get("WB_MSA_URL") or None,
            harness_python=interpreter("WB_HARNESS_PYTHON", harness or "")
            if os.environ.get("WB_HARNESS_PYTHON") or harness
            else None,
            harness_shared_dir=path("WB_HARNESS_SHARED_DIR", "")
            if os.environ.get("WB_HARNESS_SHARED_DIR")
            else None,
            harness_remote_dir=os.environ.get("WB_HARNESS_REMOTE_DIR") or None,
            harness_url=os.environ.get("WB_HARNESS_URL") or None,
            harness_token=os.environ.get("WB_HARNESS_TOKEN") or None,
            checkpoints_file=path("WB_CHECKPOINTS_FILE", "")
            if os.environ.get("WB_CHECKPOINTS_FILE")
            else None,
            allowed_origins=tuple(
                os.environ.get(
                    "WB_ALLOWED_ORIGINS", "http://127.0.0.1:4320,http://localhost:4320"
                ).split(",")
            ),
        )
