"""Host configuration is separate from the public source tree."""

import os
from dataclasses import dataclass
from pathlib import Path


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

    @classmethod
    def from_env(cls):
        def path(key: str, default: str) -> Path:
            return Path(os.environ.get(key, default)).expanduser().resolve()

        state = path("WB_STATE_DIR", ".state")
        return cls(
            state_dir=state,
            image_file=path("WB_IMAGE_FILE", "/opt/opendde/image-reference.txt"),
            code_file=path("WB_CODE_FILE", "/opt/opendde/runtime-code-reference.txt"),
            model_dir=path("WB_MODEL_DIR", "/opt/opendde/data/opendde"),
            cache_dir=path("WB_CACHE_DIR", str(state / "cache")),
            capacity_dir=path("WB_CAPACITY_DIR", str(state)),
            allowed_origins=tuple(
                os.environ.get(
                    "WB_ALLOWED_ORIGINS", "http://127.0.0.1:4320,http://localhost:4320"
                ).split(",")
            ),
        )
