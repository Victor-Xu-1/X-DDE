"""Bounded HTTPS to fixed public authorities, without redirects or inherited proxy secrets."""

import hashlib
import json
import logging
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

AUTHORITIES = frozenset(
    {"api.platform.opentargets.org", "rest.uniprot.org", "www.ebi.ac.uk", "files.rcsb.org"}
)
LIMIT = 8 * 1024**2
MAX_ATTEMPTS = 3
RETRYABLE_STATUS = frozenset({408, 429, 500, 502, 503, 504})
logger = logging.getLogger(__name__)


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
    last_error = None
    reason = "response deadline"
    for attempt in range(MAX_ATTEMPTS):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            break
        try:
            raw, release = read_response(
                opener, request, deadline, min(20, remaining), require_json
            )
            return raw, {
                "url": url,
                "response_sha256": hashlib.sha256(raw).hexdigest(),
                "release": release,
                "raw_document": raw,
            }
        except HTTPError as exc:
            status = exc.code
            exc.close()
            last_error = exc
            if status not in RETRYABLE_STATUS:
                raise SourceUnavailable(
                    f"Public source returned HTTP {status}; its access or endpoint needs review."
                ) from exc
            reason = f"HTTP {status}"
        except (URLError, TimeoutError, OSError) as exc:
            last_error = exc
            reason = type(exc).__name__
        delay = 0.25 * 2**attempt
        if attempt + 1 >= MAX_ATTEMPTS or time.monotonic() + delay >= deadline:
            break
        logger.warning(
            "Retrying public source %s after %s; attempt %d/%d within its time budget",
            parsed.hostname,
            reason,
            attempt + 2,
            MAX_ATTEMPTS,
        )
        time.sleep(delay)
    raise SourceUnavailable(
        f"Public source is unavailable after bounded retries ({reason}); retry this task later."
    ) from last_error


def read_response(opener, request, deadline, timeout, require_json):
    with opener.open(request, timeout=timeout) as response:
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
        return raw, response.headers.get("X-UniProt-Release", "")[:80]


def fetch(url: str, body: dict | None = None) -> tuple[dict, dict]:
    raw, receipt = request_bytes(url, body)
    try:
        value = json.loads(raw)
    except (ValueError, UnicodeError) as exc:
        raise SourceUnavailable("Public source returned malformed JSON.") from exc
    if not isinstance(value, dict):
        raise SourceUnavailable("Public source returned an unexpected JSON document.")
    return value, receipt
