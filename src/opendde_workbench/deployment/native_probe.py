"""One owned, bounded container lifecycle for installation-only native probes."""

import json
import re
from pathlib import Path
from uuid import uuid4

from .. import container_runtime
from ..locations import atomic_json
from .native_probe_ownership import PROGRAM_LABEL, TOKEN_LABEL, cleanup_probe, owned_probe
from .native_probe_recovery import recover_probe


def run_probe(identifier, image, arguments, execute, directory):
    """Retain native exit and cleanup evidence independently of Docker auto-removal."""
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    recover_probe(directory, identifier)
    runtime = container_runtime.read(directory)
    token = uuid4().hex
    name = "xdde-install-" + identifier + "-" + token
    receipt = directory / "native-probe.json"
    record = {
        "schema": 1,
        "program": identifier,
        "token": token,
        "container": name,
        "image": image,
        "state": "preparing",
        "container_runtime": runtime.value,
    }
    atomic_json(receipt, record)
    failure = None
    try:
        container = execute(
            [
                "docker",
                "create",
                "--name",
                name,
                "--label",
                TOKEN_LABEL + "=" + token,
                "--label",
                PROGRAM_LABEL + "=" + identifier,
                *arguments,
            ],
            timeout=30,
        ).strip()
        if not re.fullmatch(r"[a-f0-9]{64}", container):
            raise RuntimeError("Native installation probe returned an invalid container identity.")
        value = owned_probe(
            json.loads(
                execute(
                    ["docker", "inspect", "--format", "{{json .}}", container],
                    timeout=15,
                )
            ),
            name,
            token,
            identifier,
            image,
        )
        if value["Id"] != container:
            raise RuntimeError("Native installation probe identity changed after creation.")
        record.update(container_id=container, state="created")
        atomic_json(receipt, record)
        output = execute(["docker", "start", "--attach", container], timeout=120)
        (directory / "native-cli.log").write_text(output, encoding="utf-8")
        value = owned_probe(
            json.loads(
                execute(
                    ["docker", "inspect", "--format", "{{json .}}", container],
                    timeout=15,
                )
            ),
            name,
            token,
            identifier,
            image,
        )
        state = record["native_exit"] = value["State"]
        if (
            state.get("Status") != "exited"
            or state.get("Running") is not False
            or type(state.get("ExitCode")) is not int
            or state["ExitCode"] != 0
            or state.get("OOMKilled") is not False
            or state.get("Dead") is not False
        ):
            raise RuntimeError("Native installation probe did not finish successfully.")
        record["state"] = "native_succeeded"
        atomic_json(receipt, record)
    except BaseException as error:
        failure = error
        record.update(state="failed", error=type(error).__name__)
        raise
    finally:
        try:
            cleanup_probe(name, token, identifier, image, directory, record)
            record.update(
                cleanup_confirmed=True, state="succeeded" if failure is None else "failed"
            )
        except Exception as cleanup_error:
            record.update(
                cleanup_confirmed=False,
                state="cleanup_unconfirmed",
                cleanup_error=type(cleanup_error).__name__,
            )
            if failure is not None:
                failure.add_note("Owned installation probe cleanup could not be confirmed.")
            else:
                raise
        finally:
            atomic_json(receipt, record)
