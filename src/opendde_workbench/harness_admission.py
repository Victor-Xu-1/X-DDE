"""Verify owned native service limits before a scientific handoff, without changing it."""

import asyncio
import json
import re

from .deployment.compute_config import read_connection
from .deployment.compute_service import ComputeService
from .opendde_limits import OpenDDELimits


async def require_managed_compute(settings, *, request_path=None):
    connection = read_connection(settings.state_dir)
    if connection is None:
        # Explicit remote services retain their own operator/lifecycle authority.
        return None
    if request_path is not None:
        request = json.loads(request_path.read_text(encoding="utf-8"))
        if request.get("operation") == "harness" and request.get("tool") == "compare":
            return None
    limits = OpenDDELimits.configured(settings)
    service = ComputeService(settings.state_dir, msa_url=settings.msa_url, resource_limits=limits)
    status = await asyncio.to_thread(service.snapshot)
    if (
        not status.get("ready")
        or status.get("resource_limits_verified") is not True
        or not re.fullmatch(r"[a-f0-9]{64}", status.get("container_id") or "")
        or (
            connection.container_id is not None
            and status.get("container_id") != connection.container_id
        )
        or status.get("resource_limits") != limits.model_dump()
    ):
        raise RuntimeError(
            "Apply the X-DDE native compute update before starting this task; "
            "its owned service and hard resource limits must be verified."
        )
    return {
        "container_id": status["container_id"],
        "resource_limits": status["resource_limits"],
        "verification": "owned_docker_host_config_before_native_handoff",
    }
