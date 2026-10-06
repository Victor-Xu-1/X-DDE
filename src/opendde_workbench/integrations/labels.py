"""Product names are independent of immutable scientific recipes and engine IDs."""


def public_name(identifier: str, native_name: str) -> str:
    if identifier == "drugclip":
        return "High-throughput screening engine"
    return native_name
