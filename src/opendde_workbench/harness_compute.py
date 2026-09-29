"""Scientific job bridge executed by the external Harness interpreter, never its own agent loop."""

import asyncio
import json
import os
import re
import signal
import sys
from pathlib import Path

from harness_contract import FILE_FIELDS, TOOLS
from managed_files import publish_shared


def stage(value, directory, bindings, job_id):
    def walk(item, key=""):
        if key in FILE_FIELDS:

            def copy(reference):
                identifier = reference[6:]
                snapshot = Path(bindings[identifier])
                source = directory / "assets" / snapshot.name
                root = os.environ.get("WB_SHARED_DIR")
                remote = os.environ.get("WB_REMOTE_DIR")
                if not root or not remote:
                    raise ValueError(
                        "Configure shared compute storage before using file-based Harness tools."
                    )
                return publish_shared(source, job_id, Path(root), remote)

            return [copy(v) for v in item] if isinstance(item, list) else copy(item)
        if isinstance(item, dict):
            return {k: walk(v, k) for k, v in item.items()}
        if isinstance(item, list):
            return [walk(v) for v in item]
        return item

    return walk(value)


async def collect_structures(client, result, directory, task_id):
    found = []

    def discover(value):
        if isinstance(value, dict):
            for key, item in value.items():
                if (
                    key == "structure_path"
                    and isinstance(item, str)
                    and Path(item).suffix.lower() in {".pdb", ".cif", ".mmcif"}
                ):
                    found.append(item)
                else:
                    discover(item)
        elif isinstance(value, list):
            for item in value:
                discover(item)

    discover(result)
    mapping = {}
    for index, path in enumerate(dict.fromkeys(found)):
        if index >= 64:
            raise ValueError("More than64 structures returned; reduce the candidate batch.")
        structure = await client.read_structure(path, task_id=task_id)
        if structure.byte_count > 25 * 1024**2:
            raise ValueError("Returned structure exceeds the25MiB preview limit.")
        name = f"structure-{index + 1}." + (
            "cif" if structure.format in {"cif", "mmcif"} else "pdb"
        )
        (directory / "output" / name).write_text(structure.text, encoding="utf-8")
        mapping[path] = name

    def replace(value):
        if isinstance(value, str):
            return mapping.get(value, value)
        if isinstance(value, dict):
            return {k: replace(v) for k, v in value.items()}
        if isinstance(value, list):
            return [replace(v) for v in value]
        return value

    return replace(result), list(mapping.values())


async def main(directory):
    from opendde_harness.plugin.protein_design.core import contracts
    from opendde_harness.plugin.protein_design.servers.client import ProteinDesignComputeClient

    request = json.loads((directory / "request.json").read_text())
    bindings = json.loads((directory / "bindings.json").read_text())
    tool = request["tool"]
    if tool == "compare":
        from harness_contract import PopulationComparison
        from opendde_harness.plugin.protein_design.core.validation import (
            compare_runs,
            load_candidates,
        )

        config = PopulationComparison.model_validate(request["payload"])

        def local(reference):
            return directory / "assets" / Path(bindings[reference[6:]]).name

        report = compare_runs(
            load_candidates(local(config.legacy_path)),
            load_candidates(local(config.current_path)),
            top_k=config.top_k,
            minimize=not config.maximize,
        )
        (directory / "output/result.json").write_text(
            json.dumps(
                {
                    "operation": "harness",
                    "complete": True,
                    "tool": tool,
                    "result": report.model_dump(mode="json"),
                },
                ensure_ascii=False,
                allow_nan=False,
            ),
            encoding="utf-8",
        )
        return
    model, method = TOOLS[tool]
    payload = stage(request["payload"], directory, bindings, directory.name)
    if model:
        contract = getattr(contracts, model)
        if "task_id" in contract.model_fields:
            payload["task_id"] = directory.name
        native = contract.model_validate(payload)
    else:
        if set(payload) - {"reference_path", "mobile_path", "target_chain_ids", "binder_chain_ids"}:
            raise ValueError("Unsupported pose RMSD field.")
        payload["task_id"] = directory.name
        native = payload
    stop = asyncio.Event()
    asyncio.get_running_loop().add_signal_handler(signal.SIGTERM, stop.set)
    url = os.environ.get("WB_COMPUTE_URL")
    if not url:
        raise ValueError("Configure WB_HARNESS_URL before running scientific tools.")
    client = ProteinDesignComputeClient(url, token=os.environ.get("WB_COMPUTE_TOKEN"), timeout=3600)
    remote_id = None
    finished = False
    try:
        if tool == "fold":
            (directory / "fold-dispatch.json").write_text(
                json.dumps({"state": "dispatching", "compute_url": url})
            )
        result = await getattr(client, method)(native)
        if tool == "fold":
            if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", result.job_id):
                raise ValueError("Compute service returned an invalid job identifier.")
            remote_id = result.job_id
            (directory / "remote-fold.json").write_text(
                json.dumps({"job_id": remote_id, "compute_url": url})
            )
            result = await client.wait_fold(remote_id, timeout=24 * 3600, stop_event=stop)
        if hasattr(result, "model_dump"):
            result = result.model_dump(mode="json")
        if not isinstance(result, dict):
            raise ValueError("Harness returned an invalid result contract.")
        if result.get("available") is False:
            raise RuntimeError(
                "Harness service is unavailable: "
                + str(result.get("reason") or result.get("error") or tool)
            )
        (directory / "output/native-result.json").write_text(
            json.dumps(result, ensure_ascii=False, allow_nan=False), encoding="utf-8"
        )
        result, structures = await collect_structures(client, result, directory, directory.name)
        body = {
            "operation": "harness",
            "complete": True,
            "tool": tool,
            "result": result,
            "structures": structures,
        }
        (directory / "output/result.json").write_text(
            json.dumps(body, ensure_ascii=False, allow_nan=False), encoding="utf-8"
        )
        finished = True
    except Exception as exc:
        response = getattr(getattr(exc, "__cause__", None), "response", None)
        if (
            tool == "fold"
            and remote_id is None
            and getattr(response, "status_code", 0) in {400, 401, 403, 404, 405, 413, 422, 429}
        ):
            (directory / "fold-dispatch.json").write_text(json.dumps({"state": "rejected"}))
        raise
    finally:
        if remote_id and not finished:
            try:
                await asyncio.wait_for(client.cancel_fold(remote_id), 5)
            except Exception as exc:
                print(
                    f"Remote fold cancellation could not be confirmed: {type(exc).__name__}",
                    file=sys.stderr,
                )
        await client.close()


async def cancel_remote(directory):
    from opendde_harness.plugin.protein_design.servers.client import ProteinDesignComputeClient

    data = json.loads((directory / "remote-fold.json").read_text())
    identifier = data["job_id"]
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", identifier):
        raise ValueError("Invalid saved native job identifier.")
    client = ProteinDesignComputeClient(
        data.get("compute_url") or os.environ["WB_COMPUTE_URL"],
        token=os.environ.get("WB_COMPUTE_TOKEN"),
        timeout=5,
    )
    try:
        await client.cancel_fold(identifier)
    finally:
        await client.close()


if __name__ == "__main__":
    directory = Path(sys.argv[1]).resolve()
    asyncio.run(
        cancel_remote(directory)
        if len(sys.argv) > 2 and sys.argv[2] == "cancel"
        else main(directory)
    )
