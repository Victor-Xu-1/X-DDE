"""A release update never chooses a new port for an existing research workspace."""

import json

import pytest

from opendde_workbench import service_port


def test_saved_owner_address_survives_lifetime_record_removal(tmp_path, monkeypatch):
    monkeypatch.setattr(service_port, "home", lambda: tmp_path)
    assert service_port.choose_port() == 4320
    record = tmp_path / "service.json"
    record.write_text(json.dumps({"port": 4322, "pid": 1234}))
    assert service_port.choose_port() == 4322
    service_port.remember_port(4322)
    record.unlink()
    assert service_port.choose_port() == 4322
    assert service_port.choose_port(4338) == 4338
    assert service_port.choose_port() == 4322


@pytest.mark.parametrize("value", [True, "4322", 0, 65536, None])
def test_invalid_saved_addresses_are_rejected_without_fallback(tmp_path, monkeypatch, value):
    monkeypatch.setattr(service_port, "home", lambda: tmp_path)
    (tmp_path / "service-port.json").write_text(json.dumps({"port": value}))
    with pytest.raises(ValueError, match="UI port"):
        service_port.choose_port()


def test_unchanged_address_is_read_only(tmp_path, monkeypatch):
    monkeypatch.setattr(service_port, "home", lambda: tmp_path)
    service_port.remember_port(4322)
    before = (tmp_path / "service-port.json").stat().st_mtime_ns
    service_port.remember_port(4322)
    assert (tmp_path / "service-port.json").stat().st_mtime_ns == before
