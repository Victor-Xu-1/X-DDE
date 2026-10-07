"""Only reviewed live-reloaded runtimes avoid the platform restart requirement."""

from .catalog import PACKAGES

# The channel adapter resolves its managed immutable image for each preflight/start.
DYNAMIC_RUNTIMES = frozenset({"caver"})


def activation_snapshot(installed):
    return {
        key: entry
        for key, entry in installed.items()
        if key not in DYNAMIC_RUNTIMES
        and (PACKAGES.get(key) is None or PACKAGES[key].kind not in {"editor", "data"})
    }


def dynamic_snapshot(installed):
    return {key: installed.get(key) for key in sorted(DYNAMIC_RUNTIMES)}
