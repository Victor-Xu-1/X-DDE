"""The configured public transport must work without inheriting proxy secrets."""

import asyncio
import json
from contextlib import contextmanager
from io import BytesIO
from types import SimpleNamespace

import pytest

from opendde_workbench.discovery import backend, network, transport


@pytest.mark.parametrize("key", ["HTTPS_PROXY", "https_proxy", network.PUBLIC_PROXY])
def test_credential_free_proxy_is_forwarded_as_one_explicit_task_setting(key):
    assert network.public_proxy_environment(
        {key: "http://127.0.0.1:7890", "OTHER_TOKEN": "never-forward"}
    ) == {network.PUBLIC_PROXY: "http://127.0.0.1:7890"}


def test_explicit_public_setting_overrides_parent_proxy_and_empty_disables_it():
    parent = {"HTTPS_PROXY": "http://user:secret@proxy.test:7890"}
    assert network.public_proxy_environment(
        {**parent, network.PUBLIC_PROXY: "http://localhost:7890"}
    ) == {network.PUBLIC_PROXY: "http://localhost:7890"}
    assert network.public_proxy_environment({**parent, network.PUBLIC_PROXY: ""}) == {}
    assert network.public_proxy_environment({"ALL_PROXY": "http://proxy.test"}) == {}


@pytest.mark.parametrize(
    "value",
    [
        "http://user:secret@proxy.test:7890",
        "http://proxy.test/private-secret",
        "http://proxy.test?secret=token",
        "http://proxy.test#private-secret",
        "http://proxy.test:0",
        "http://proxy.test:99999",
        "http://proxy.test:not-a-port",
        "http://",
        "socks5://proxy.test:7890",
        "file:///private-secret",
        "http://proxy.test\nsecret",
    ],
)
def test_invalid_proxy_fails_closed_without_echoing_credentials(value):
    with pytest.raises(ValueError) as caught:
        network.public_proxy_environment({network.PUBLIC_PROXY: value})
    assert value not in str(caught.value)
    assert "private-secret" not in str(caught.value) and "token" not in str(caught.value)


def test_api_and_task_transport_share_the_credential_free_application_proxy(monkeypatch):
    monkeypatch.delenv(network.PUBLIC_PROXY, raising=False)
    monkeypatch.delenv("HTTPS_PROXY", raising=False)
    monkeypatch.delenv("https_proxy", raising=False)
    monkeypatch.setenv("HTTP_PROXY", "http://user:secret@proxy.test")
    monkeypatch.setenv("ALL_PROXY", "http://user:secret@proxy.test")
    assert network.configured_proxy() == {}
    monkeypatch.setenv("HTTPS_PROXY", "http://127.0.0.1:7890")
    assert network.configured_proxy() == {"https": "http://127.0.0.1:7890"}
    monkeypatch.setenv("HTTPS_PROXY", "http://user:secret@proxy.test")
    with pytest.raises(ValueError, match="without credentials"):
        network.configured_proxy()
    monkeypatch.setenv(network.PUBLIC_PROXY, "http://127.0.0.1:7890")
    assert network.configured_proxy() == {"https": "http://127.0.0.1:7890"}


def test_invalid_server_proxy_is_a_source_unavailable_error_without_secret_values(monkeypatch):
    monkeypatch.setenv(network.PUBLIC_PROXY, "http://user:secret@proxy.test")
    with pytest.raises(transport.SourceUnavailable) as caught:
        transport.request_bytes("https://files.rcsb.org/download/9BIG.cif")
    assert "secret@" not in str(caught.value)
    assert "proxy configuration" in str(caught.value)


def test_synchronous_name_lookup_uses_the_application_proxy_and_source_identity(monkeypatch):
    from opendde_workbench.discovery.sources import lookup

    monkeypatch.delenv(network.PUBLIC_PROXY, raising=False)
    monkeypatch.setenv("HTTPS_PROXY", "http://127.0.0.1:7890")
    raw = json.dumps(
        {
            "data": {
                "search": {
                    "total": 1,
                    "hits": [{"id": "ENSG00000166888", "name": "STAT6", "entity": "target"}],
                }
            }
        }
    ).encode()
    handlers = []

    @contextmanager
    def response(request, timeout):
        assert request.full_url == "https://api.platform.opentargets.org/api/v4/graphql"
        assert 0 < timeout <= 20
        with BytesIO(raw) as stream:
            yield SimpleNamespace(
                status=200, headers={"Content-Type": "application/json"}, read1=stream.read
            )

    def build(*values):
        handlers.extend(values)
        return SimpleNamespace(open=response)

    monkeypatch.setattr(transport, "build_opener", build)
    result = lookup("target", "STAT6")
    assert result["hits"][0]["id"] == "ENSG00000166888" and result["total"] == 1
    assert handlers[0].proxies == {"https": "http://127.0.0.1:7890"}
    assert isinstance(handlers[1], transport.NoRedirect)


def test_discovery_process_uses_proxy_without_forwarding_parent_secrets(tmp_path, monkeypatch):
    monkeypatch.setenv(network.PUBLIC_PROXY, "http://127.0.0.1:7890")
    monkeypatch.setenv("OTHER_TOKEN", "never-forward")
    calls = []

    async def start(python, script, directory, env):
        calls.append(env)
        return "controlled-process-boundary"

    monkeypatch.setattr(backend.local_process, "start", start)
    result = asyncio.run(backend.DiscoveryBackend(None).start(None, tmp_path))
    assert result == "controlled-process-boundary"
    assert calls[0][network.PUBLIC_PROXY] == "http://127.0.0.1:7890"
    assert "OTHER_TOKEN" not in calls[0] and "HTTPS_PROXY" not in calls[0]
    assert (tmp_path / "discovery-execution.json").is_file()


def test_request_passes_proxy_to_the_same_bounded_verified_https_transport(monkeypatch):
    monkeypatch.setenv(network.PUBLIC_PROXY, "http://127.0.0.1:7890")
    handlers = []
    raw = b'{"source":"verified-record"}'

    class Response:
        status = 200
        headers = {"Content-Type": "application/json"}

        def __enter__(self):
            self.stream = BytesIO(raw)
            return self

        def __exit__(self, *args):
            self.stream.close()

        def read1(self, size):
            return self.stream.read(size)

    def build(*values):
        handlers.extend(values)
        return SimpleNamespace(open=lambda request, timeout: Response())

    monkeypatch.setattr(transport, "build_opener", build)
    response, receipt = transport.request_bytes("https://files.rcsb.org/download/9BIG.cif")
    assert response == raw and receipt["raw_document"] == raw
    assert handlers[0].proxies == {"https": "http://127.0.0.1:7890"}
    assert isinstance(handlers[1], transport.NoRedirect)
