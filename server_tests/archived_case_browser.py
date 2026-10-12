"""Explicit historical-case context for retained-output browser checks only."""

import re
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


def archived_case_context(page):
    # These tests use retained BRD4/HER2 native files, never current uncomputed
    # STAT6 inputs. Route to the existing reviewed archive; do not synthesize data.
    def archive(route):
        parts = urlsplit(route.request.url)
        query = dict(parse_qsl(parts.query, keep_blank_values=True))
        query["profile"] = "archive"
        url = urlunsplit(parts._replace(query=urlencode(query)))
        route.continue_(url=url)

    page.route(re.compile(r"/api/examples(?:/[^/?]+)*(?:\?.*)?$"), archive)
