"""Reconcile the previous probe under the same durable installation operation."""

import json
import re
from uuid import uuid4

from .. import container_runtime
from ..locations import atomic_json
from .native_probe_ownership import cleanup_probe


def recover_probe(directory, identifier):
    receipt = directory / "native-probe.json"
    if not receipt.exists():
        return
    previous = json.loads(receipt.read_text(encoding="utf-8"))
    token = previous.get("token", "")
    name = "xdde-install-" + identifier + "-" + token
    if (
        previous.get("schema") != 1
        or previous.get("program") != identifier
        or not re.fullmatch(r"[a-f0-9]{32}", token)
        or previous.get("container") != name
        or not re.fullmatch(r"sha256:[a-f0-9]{64}", previous.get("image", ""))
    ):
        raise RuntimeError("Previous installation probe ownership receipt is invalid.")
    runtime = container_runtime.read(directory)
    if previous.get("container_runtime") != runtime.value:
        raise RuntimeError(
            "Previous installation probe Docker binding differs from its frozen receipt."
        )
    history = directory / "native-probe-history" / token
    history.mkdir(parents=True, exist_ok=True)
    for filename in (
        "native-probe.json",
        "native-cli.log",
        "native-cleanup.json",
        container_runtime.RECEIPT,
    ):
        source, target = directory / filename, history / filename
        if source.is_file() and not target.exists():
            with target.open("xb") as stream:
                stream.write(source.read_bytes())
    attempt = history / ("recovery-" + uuid4().hex)
    attempt.mkdir()
    proof = {
        "container": name,
        "image": previous["image"],
        "state": "pending",
        "container_runtime": runtime.value,
    }
    try:
        cleanup_probe(name, token, identifier, previous["image"], attempt, proof, runtime=runtime)
        proof["state"] = "removed"
    except Exception as error:
        proof.update(state="unconfirmed", error=type(error).__name__)
        raise RuntimeError("Previous installation probe cleanup could not be confirmed.") from error
    finally:
        atomic_json(attempt / "reconciliation.json", proof)
