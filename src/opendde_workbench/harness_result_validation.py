"""Keep provider error prose out of successful scientific result contracts."""

import json


def validate_search_response(tool, result, *, directory=None):
    if tool not in {"protrek-sequence", "protrek-structure"}:
        return
    if directory is not None:
        # Private failure evidence is not a downloadable research result.
        # Preserve the actual provider envelope before rejecting error prose.
        data = json.dumps(result, ensure_ascii=False, allow_nan=False).encode("utf-8")
        if len(data) > 4 * 1024**2:
            raise ValueError("Protein homology response exceeds its retained evidence limit.")
        path = directory / "native-search-response.json"
        if path.exists():
            if path.read_bytes() != data:
                raise ValueError("The original protein homology response must remain unchanged.")
        else:
            path.write_bytes(data)
    body = result.get("result")
    if (
        not isinstance(body, str)
        or not body.strip()
        or body.strip().startswith(
            (
                "ProTrek structure search unavailable:",
                "ProTrek sequence search unavailable:",
                "Structure file not found:",
                "Invalid protein sequence;",
                "ProTrek is disabled",
            )
        )
    ):
        raise RuntimeError(
            "Protein homology search did not return a usable result. "
            "Check the selected service and input chain before retrying."
        )
