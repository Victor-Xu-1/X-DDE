"""Bounded HTTPS to fixed public authorities, without redirects or inherited proxy secrets."""

import hashlib
import json
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

AUTHORITIES = frozenset(
    {"api.platform.opentargets.org", "rest.uniprot.org", "www.ebi.ac.uk", "files.rcsb.org"}
)
LIMIT = 8 * 1024**2


class SourceUnavailable(RuntimeError):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise SourceUnavailable("The public source redirected; its endpoint needs review.")


def request_bytes(url: str, body: dict | None = None, *, require_json=True):
    parsed = urlsplit(url)
    if (
        parsed.scheme != "https"
        or parsed.hostname not in AUTHORITIES
        or parsed.port not in {None, 443}
        or parsed.username
        or parsed.password
        or parsed.fragment
    ):
        raise ValueError("Only reviewed public-source HTTPS endpoints are permitted.")
    payload = json.dumps(body, allow_nan=False).encode() if body is not None else None
    request = Request(
        url,
        data=payload,
        headers={
            "Accept": "application/json" if require_json else "*/*",
            "Content-Type": "application/json",
            "User-Agent": "X-DDE/0.4 research-evidence",
        },
    )
    opener = build_opener(ProxyHandler({}), NoRedirect())
    deadline = time.monotonic() + 20
    try:
        with opener.open(request, timeout=20) as response:
            if response.status != 200 or (
                require_json and "json" not in response.headers.get("Content-Type", "")
            ):
                raise SourceUnavailable("Public source returned an unexpected response type.")
            chunks, size = [], 0
            while True:
                if time.monotonic() > deadline:
                    raise SourceUnavailable("Public source exceeded its response time budget.")
                chunk = response.read1(min(65536, LIMIT + 1 - size))
                if not chunk:
                    break
                chunks.append(chunk)
                size += len(chunk)
                if size > LIMIT:
                    raise SourceUnavailable("Public response exceeds the bounded evidence limit.")
            raw = b"".join(chunks)
            if len(raw) > LIMIT:
                raise SourceUnavailable("Public response exceeds the bounded evidence limit.")
            release = response.headers.get("X-UniProt-Release", "")[:80]
    except (HTTPError, URLError, TimeoutError, OSError) as exc:
        raise SourceUnavailable(
            "Public source is unavailable or timed out; retry this task later."
        ) from exc
    return raw, {
        "url": url,
        "response_sha256": hashlib.sha256(raw).hexdigest(),
        "release": release,
        "raw_document": raw,
    }


def fetch(url: str, body: dict | None = None) -> tuple[dict, dict]:
    raw, receipt = request_bytes(url, body)
    try:
        value = json.loads(raw)
    except (ValueError, UnicodeError) as exc:
        raise SourceUnavailable("Public source returned malformed JSON.") from exc
    if not isinstance(value, dict):
        raise SourceUnavailable("Public source returned an unexpected JSON document.")
    return value, receipt
