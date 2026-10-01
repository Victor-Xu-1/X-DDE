"""Transient protocol failures are retried within one fixed budget; unsafe responses are not."""

import hashlib
from io import BytesIO
from urllib.error import HTTPError

import pytest

from opendde_workbench.discovery import transport


class Response:
    status = 200
    headers = {"Content-Type": "application/json", "X-UniProt-Release": "reviewed"}

    def __init__(self, raw=b'{"source": "actual boundary"}'):
        self.stream = BytesIO(raw)

    def read1(self, size):
        return self.stream.read(size)

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.stream.close()


def opener_boundary(monkeypatch, outcomes):
    calls = []

    class Opener:
        def open(self, request, timeout):
            calls.append((request, timeout))
            value = outcomes.pop(0)
            if isinstance(value, BaseException):
                raise value
            return value

    monkeypatch.setattr(transport, "build_opener", lambda *args: Opener())
    monkeypatch.setattr(transport.time, "sleep", lambda delay: None)
    return calls


def unavailable(status):
    return HTTPError(
        "https://www.ebi.ac.uk/chembl/api/data/target.json",
        status,
        "public boundary",
        {},
        BytesIO(b"unavailable"),
    )


def test_transient_failure_then_success_preserves_exact_response_receipt(monkeypatch, caplog):
    raw = b'{"targets": []}'
    calls = opener_boundary(monkeypatch, [unavailable(503), Response(raw)])
    actual, receipt = transport.request_bytes("https://www.ebi.ac.uk/chembl/api/data/target.json")
    assert actual == raw and receipt["response_sha256"] == hashlib.sha256(raw).hexdigest()
    assert receipt["raw_document"] == raw
    assert len(calls) == 2 and all(0 < timeout <= 20 for _, timeout in calls)
    assert "HTTP 503" in caplog.text and "attempt 2/3" in caplog.text


def test_repeated_unavailability_stops_at_the_fixed_attempt_limit(monkeypatch):
    calls = opener_boundary(monkeypatch, [unavailable(429) for _ in range(3)])
    with pytest.raises(transport.SourceUnavailable, match="bounded retries"):
        transport.request_bytes("https://www.ebi.ac.uk/chembl/api/data/target.json")
    assert len(calls) == 3


@pytest.mark.parametrize("status", [400, 401, 403, 404])
def test_permission_or_endpoint_errors_are_not_retried(monkeypatch, status):
    error = unavailable(status)
    calls = opener_boundary(monkeypatch, [error])
    with pytest.raises(transport.SourceUnavailable, match=f"HTTP {status}"):
        transport.request_bytes("https://www.ebi.ac.uk/chembl/api/data/target.json")
    assert len(calls) == 1 and error.fp.closed


def test_expired_budget_does_not_start_another_request(monkeypatch):
    calls = opener_boundary(monkeypatch, [unavailable(503)])
    timestamps = iter([0, 0, transport.RESPONSE_BUDGET + 1])
    monkeypatch.setattr(transport.time, "monotonic", lambda: next(timestamps))
    with pytest.raises(transport.SourceUnavailable, match="bounded retries"):
        transport.request_bytes("https://www.ebi.ac.uk/chembl/api/data/target.json")
    assert len(calls) == 1


def test_redirect_or_invalid_response_type_does_not_trigger_a_second_authority(monkeypatch):
    calls = opener_boundary(monkeypatch, [transport.SourceUnavailable("endpoint redirected")])
    with pytest.raises(transport.SourceUnavailable, match="redirected"):
        transport.request_bytes("https://www.ebi.ac.uk/chembl/api/data/target.json")
    assert len(calls) == 1
    response = Response()
    response.headers = {"Content-Type": "text/html"}
    calls = opener_boundary(monkeypatch, [response])
    with pytest.raises(transport.SourceUnavailable, match="response type"):
        transport.request_bytes("https://www.ebi.ac.uk/chembl/api/data/target.json")
    assert len(calls) == 1 and response.stream.closed
