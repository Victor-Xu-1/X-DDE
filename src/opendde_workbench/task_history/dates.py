"""Exact UTC keys for read-only history filters; stored timestamps are unchanged."""

from datetime import UTC, datetime


def utc_key(value: str | datetime) -> str:
    stamp = datetime.fromisoformat(value) if isinstance(value, str) else value
    # Early retained records without an offset used the store's UTC clock.
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=UTC)
    return stamp.astimezone(UTC).isoformat(timespec="microseconds")
