"""Canonical limits for a native service; no configuration or model ownership here."""

import importlib.util
import re
import subprocess
import sys
from functools import lru_cache
from pathlib import Path


@lru_cache(maxsize=1)
def canonical():
    # This script also runs under the isolated Harness interpreter. Load exactly
    # our sibling policy, without mixing its site-packages with X-DDE's runtime.
    name = "_xdde_native_opendde_limits"
    specification = importlib.util.spec_from_file_location(
        name, Path(__file__).resolve().parents[1] / "opendde_limits.py"
    )
    module = importlib.util.module_from_spec(specification)
    sys.modules[name] = module
    specification.loader.exec_module(module)
    return module


def policy(value=None):
    return canonical().OpenDDELimits.model_validate({} if value is None else value)


def run(*arguments):
    return subprocess.run(
        ["docker", *arguments], check=True, capture_output=True, text=True, timeout=15
    ).stdout


def require_support():
    return canonical().parse_support(run("info", "--format", canonical().SUPPORT_FORMAT))


def values(container):
    config = container.get("HostConfig", {})
    return {
        "memory": config.get("Memory"),
        "memory_swap": config.get("MemorySwap"),
        "nano_cpus": config.get("NanoCpus"),
        "pids_limit": config.get("PidsLimit"),
        "oom_kill_disable": config.get("OomKillDisable"),
    }


def verified(container, limits):
    try:
        limits.verify_resources(values(container))
    except RuntimeError:
        return False
    return True


def launch_flags(arguments, limits):
    controlled = {"--memory", "--memory-swap", "--cpus", "--pids-limit"}
    if any(value.split("=", 1)[0] in controlled for value in arguments):
        raise ValueError("Native factory supplied competing compute resource arguments.")
    if any(value.split("=", 1)[0] in {"--privileged", "--oom-kill-disable"} for value in arguments):
        raise ValueError("Native compute cannot disable container resource protections.")
    return limits.arguments()


def apply_existing(container, limits, inspect, ownership, connection, queue_idle):
    """Update an exact owned idle instance, then verify rather than trusting exit 0."""
    identifier = container.get("Id", "")
    if not re.fullmatch(r"[a-f0-9]{64}", identifier):
        raise ValueError("Native compute needs an exact immutable container identity.")
    ownership(container, connection)
    if container.get("State", {}).get("Running"):
        queue_idle()
    require_support()
    run("container", "update", *limits.arguments(), identifier)
    current = inspect(identifier)
    ownership(current, connection)
    if current is None or current.get("Id") != identifier:
        raise ValueError("Native compute identity changed while applying resource limits.")
    if bool(current.get("State", {}).get("Running")) != bool(
        container.get("State", {}).get("Running")
    ):
        raise ValueError("Native compute running state changed during resource configuration.")
    limits.verify_resources(values(current))
    return current
