"""Operator-owned endpoint for the reviewed ColabFold-compatible native client."""

from urllib.parse import urlsplit

DEFAULT_MSA_ENDPOINT = "https://api.colabfold.com"


def msa_endpoint(value=None):
    value = DEFAULT_MSA_ENDPOINT if value is None else value
    if (
        not isinstance(value, str)
        or not value
        or any(ord(char) <= 32 or ord(char) == 127 or char == "\\" for char in value)
    ):
        raise ValueError("The MSA service requires a credential-free HTTP(S) endpoint.")
    try:
        parts = urlsplit(value)
        port = parts.port
    except ValueError as error:
        raise ValueError("The MSA service endpoint is invalid.") from error
    if (
        parts.scheme not in {"http", "https"}
        or not parts.hostname
        or parts.username is not None
        or parts.password is not None
        or parts.query
        or parts.fragment
        or port is not None
        and not 1 <= port <= 65535
    ):
        raise ValueError("The MSA service requires a credential-free HTTP(S) endpoint.")
    return value.rstrip("/")
