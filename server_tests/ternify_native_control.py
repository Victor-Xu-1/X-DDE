"""CI-only bounded original-method control, not a completed X-DDE research example."""

import argparse
import importlib.metadata
import json
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

from ternify_candidate_io import ARCHIVE, COMMIT, digest, inspect_output, restore, write_report


def resource_proof():
    relative = next(
        line.split(":", 2)[2]
        for line in Path("/proc/self/cgroup").read_text().splitlines()
        if line.startswith("0::")
    )
    group = Path("/sys/fs/cgroup") / relative.lstrip("/")
    value = {
        name: (group / name).read_text().strip()
        for name in ("memory.max", "memory.swap.max", "cpu.max", "pids.max")
    }
    if value != {
        "memory.max": str(1536 * 1024**2),
        "memory.swap.max": "0",
        "cpu.max": "100000 100000",
        "pids.max": "64",
    }:
        raise ValueError("The candidate control lacks its declared kernel limits.")
    return value


def resource_usage():
    relative = next(
        line.split(":", 2)[2]
        for line in Path("/proc/self/cgroup").read_text().splitlines()
        if line.startswith("0::")
    )
    group = Path("/sys/fs/cgroup") / relative.lstrip("/")
    return {
        name: (group / name).read_text().strip()
        for name in ("memory.peak", "memory.events", "cpu.stat")
    }


def run_native(control, root):
    settings = (control / "tcs.inp").read_text()
    for key, value in {"N_ini": 12, "N_search": 1, "N_keep": 1, "N_processes": 1}.items():
        lines = settings.splitlines()
        if sum(line.startswith(key + ":") for line in lines) != 1:
            raise ValueError("The native reference input has an ambiguous sampling budget.")
        settings = (
            "\n".join(f"{key}: {value}" if line.startswith(key + ":") else line for line in lines)
            + "\n"
        )
    (control / "bounded.inp").write_text(settings)
    with (root / "native.log").open("wb") as log:
        process = subprocess.Popen(
            [
                sys.executable,
                str(Path(__file__).with_name("ternify_seed_policy.py")),
                "--source",
                str(root / "source/src"),
                "--control",
                str(control),
            ],
            cwd=control,
            stdout=log,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
        try:
            code = process.wait(timeout=900)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=3)
            raise RuntimeError("The declared native control budget was exhausted.") from None
    if code:
        raise RuntimeError(f"The native candidate control exited with status {code}.")


def main():
    if os.environ.get("CI") != "true":
        raise RuntimeError("Run this original-method control only on the isolated CI runner.")
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True, type=Path)
    root = parser.parse_args().root.resolve()
    root.mkdir(parents=True, exist_ok=False)
    started = time.monotonic()
    proof = {
        "source_commit": COMMIT,
        "source_archive_sha256": ARCHIVE,
        "license": "MIT",
        "research_template_acceptance": False,
        "production_integration": False,
        "kernel_limits": resource_proof(),
        "native_worker_seed_controlled": True,
        "worker_policy_sha256": digest(Path(__file__).with_name("ternify_seed_policy.py")),
        "root_seeds": [31, 31, 137],
        "sampling_per_record": {"initial": 12, "optimize": 1, "keep": 1, "processes": 1},
        "packages": {
            name: importlib.metadata.version(name) for name in ("rdkit", "numpy", "scipy")
        },
    }
    try:
        control, identities = restore(root)
        proof["input_sha256"] = identities
        run_native(control, root)
        if any(digest(control / name) != expected for name, expected in identities.items()):
            raise ValueError("The native method changed its source input files.")
        proof["worker_seed_proof"] = json.loads((control / "worker-seed-proof.json").read_text())
        proof.update(inspect_output(control), native_protocol_verified=True)
    except BaseException as exc:
        proof.update(native_protocol_verified=False, error_type=type(exc).__name__)
        raise
    finally:
        proof["elapsed_seconds"] = time.monotonic() - started
        proof["kernel_usage"] = resource_usage()
        write_report(root / "protocol-review.json", proof)


if __name__ == "__main__":
    main()
