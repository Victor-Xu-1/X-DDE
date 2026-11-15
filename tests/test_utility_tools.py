"""Local tool discovery must never install or start a recognition process."""

from unittest.mock import Mock, patch

from opendde_workbench.utility_routes import recognition_available
from opendde_workbench.deployment.compute_service import ComputeService


def test_discovery_only_reads_fixed_bounded_frontend_health():
    response = Mock()
    response.read.return_value = b'{"app":"decimer-workbench"}'
    opener = Mock()
    opener.open.return_value.__enter__ = Mock(return_value=response)
    opener.open.return_value.__exit__ = Mock(return_value=False)
    with patch("urllib.request.build_opener", return_value=opener):
        assert recognition_available()
    opener.open.assert_called_once_with("http://127.0.0.1:8940/health", timeout=2)
    response.read.assert_called_once_with(4097)


def test_discovery_failure_is_not_model_readiness():
    with patch("urllib.request.build_opener") as build:
        build.return_value.open.side_effect = OSError("offline")
        assert recognition_available() is False


def test_platform_boot_never_starts_saved_automatic_compute(tmp_path):
    service = ComputeService(tmp_path)
    service.snapshot = Mock(return_value={"running": False})
    service.invoke = Mock(side_effect=AssertionError("Unexpected model start"))
    assert service.ensure() == {"running": False}
    service.invoke.assert_not_called()
