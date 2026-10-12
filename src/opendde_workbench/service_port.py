"""Persist one workspace's successful UI address across upgrades and restarts."""

from .locations import atomic_json, home, read_json


def checked_port(value):
    if type(value) is not int or not 1024 <= value <= 65535:
        raise ValueError("The UI port must be an integer between 1024 and 65535.")
    return value


def choose_port(requested=None):
    if requested is not None:
        return checked_port(requested)
    preference = read_json(home() / "service-port.json")
    if preference:
        return checked_port(preference.get("port"))
    lifetime = read_json(home() / "service.json")
    return checked_port(lifetime["port"] if lifetime else 4320)


def remember_port(value):
    port = checked_port(value)
    path = home() / "service-port.json"
    if read_json(path) != {"port": port}:
        atomic_json(path, {"port": port})
