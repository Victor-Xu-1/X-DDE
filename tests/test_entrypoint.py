"""Custom localhost ports retain same-origin mutation protection."""

import sys

from opendde_workbench.__main__ import main
from opendde_workbench.settings import Settings


def test_custom_port_retains_explicit_origin_policy(monkeypatch):
    monkeypatch.setattr(sys, "argv", ["x-dde", "--port", "4322"])
    monkeypatch.delenv("WB_ALLOWED_ORIGINS", raising=False)
    monkeypatch.setattr("opendde_workbench.__main__.uvicorn.run", lambda *a, **kw: None)
    main()
    assert Settings.from_env().allowed_origins == ("http://127.0.0.1:4322", "http://localhost:4322")
    monkeypatch.setenv("WB_ALLOWED_ORIGINS", "http://127.0.0.1:4322")
    main()
    assert Settings.from_env().allowed_origins == ("http://127.0.0.1:4322",)
