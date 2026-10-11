"""Do not silently choose among experimental alternate atom locations."""


def require_explicit_alternates(raw: bytes) -> None:
    if any(
        line.startswith((b"ATOM  ", b"HETATM")) and line[16:17].strip() for line in raw.splitlines()
    ):
        raise ValueError(
            "The receptor contains alternate atom locations. "
            "Use Structure preparation to select one explicit alternate before docking."
        )
