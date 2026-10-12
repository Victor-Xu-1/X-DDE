"""Forward only a validated, credential-free proxy to public-data processes."""

import os
from collections.abc import Mapping
from urllib.parse import urlsplit

PUBLIC_PROXY = "WB_PUBLIC_DATA_PROXY"


def validate_proxy(value: str) -> str:
    message = "Public-data proxy must be an HTTP(S) URL without credentials, path or query."
    if any(ord(c) <= 32 or ord(c) == 127 for c in value):
        raise ValueError(message)
    try:
        parsed = urlsplit(value)
        port = parsed.port
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
            or parsed.path not in {"", "/"}
            or parsed.query
            or parsed.fragment
            or (port is not None and not 1 <= port <= 65535)
        ):
            raise ValueError(message)
    except ValueError:
        # Never include a supplied URL: it may contain unintended credentials.
        raise ValueError(message) from None
    return value


def public_proxy_environment(environment: Mapping[str, str] | None = None) -> dict[str, str]:
    source = os.environ if environment is None else environment
    value = source.get(PUBLIC_PROXY)
    if value is None:
        value = source.get("HTTPS_PROXY") or source.get("https_proxy")
    return {PUBLIC_PROXY: validate_proxy(value)} if value else {}


def configured_proxy() -> dict[str, str]:
    # Synchronous API lookups and isolated task processes share one validator.
    # Only the dedicated setting or credential-free application HTTPS proxy is
    # admitted; ALL_PROXY, HTTP_PROXY and arbitrary environment values are not.
    value = public_proxy_environment().get(PUBLIC_PROXY)
    return {"https": value} if value else {}
