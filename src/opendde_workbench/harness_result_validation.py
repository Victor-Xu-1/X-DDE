"""Keep provider error prose out of successful scientific result contracts."""


def validate_search_response(tool, result):
    if tool not in {"protrek-sequence", "protrek-structure"}:
        return
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
