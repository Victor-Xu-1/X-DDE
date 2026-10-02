"""Private loopback service connection; no model-provider credentials or public secrets."""

import hashlib
import os
import secrets
from pathlib import Path
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, model_validator

from ..locations import atomic_json, read_json


class ComputeConfiguration(BaseModel):
    model_config = ConfigDict(extra="forbid")
    owner: str = "X-DDE"
    state_id: str
    container: str = Field(pattern=r"^xdde-harness-[a-z0-9-]+$")
    container_id: str | None = None
    url: str
    token: str = Field(min_length=16, repr=False)
    shared_dir: str
    remote_dir: str
    image: str = Field(pattern=r"^aurekaresearch/opendde-harness@sha256:[a-f0-9]{64}$")
    code: str
    network: str = Field(pattern=r"^(host|bridge)$")
    automatic: bool = True

    @model_validator(mode="after")
    def owned_loopback(self):
        url = urlsplit(self.url)
        if (
            self.owner != "X-DDE"
            or url.scheme != "http"
            or url.hostname != "127.0.0.1"
            or url.username
            or url.password
            or url.path
            or url.query
            or url.fragment
            or not url.port
            or not 1024 <= url.port <= 65535
        ):
            raise ValueError("Managed native compute must use an authenticated loopback endpoint.")
        for value in (self.shared_dir, self.remote_dir, self.code):
            path = Path(value)
            if (
                not path.is_absolute()
                or ".." in path.parts
                or any(c in value for c in (",", "\n", "\r", "\x00"))
            ):
                raise ValueError("Native compute requires absolute owned storage paths.")
        return self


def state_identity(state):
    return hashlib.sha256(str(state.resolve()).encode()).hexdigest()[:12]


def read_connection(state):
    path = state / "compute-service.json"
    if not path.exists():
        return None
    if path.is_symlink() or path.stat().st_size > 16384 or path.stat().st_mode & 0o077:
        raise ValueError("Native service connection must be a bounded private file with mode 0600.")
    value = ComputeConfiguration.model_validate(read_json(path))
    if value.state_id != state_identity(state):
        raise ValueError("The native service belongs to another X-DDE state directory.")
    return value


def prepare_connection(state, root, installed, network):
    old = read_connection(state)
    if old is not None:
        return old
    if (
        os.environ.get("WB_HARNESS_URL")
        or not all(key in installed for key in ("compute", "runtime", "harness"))
        or not any(key in installed for key in ("abag", "standard"))
    ):
        return None
    import socket

    port = None
    for candidate in range(8080, 8100):
        with socket.socket() as probe:
            try:
                probe.bind(("127.0.0.1", candidate))
                port = candidate
                break
            except OSError:
                continue
    if port is None:
        raise ValueError("No free native compute loopback port in 8080–8099.")
    shared = state / "harness-shared"
    shared.mkdir(parents=True, exist_ok=True, mode=0o700)
    identity = state_identity(state)
    value = ComputeConfiguration(
        state_id=identity,
        container="xdde-harness-" + identity,
        url=f"http://127.0.0.1:{port}",
        token=secrets.token_urlsafe(32),
        shared_dir=str(shared),
        remote_dir=str(shared),
        image=installed["compute"]["image"],
        code=installed["runtime"]["code"],
        network=network,
    )
    atomic_json(state / "compute-service.json", value.model_dump())
    return value
