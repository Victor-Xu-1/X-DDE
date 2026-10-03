"""X-DDE publication counter; protocol and data schema versions are independent."""

import re
from dataclasses import dataclass

PATCH_MAX = 100
MINOR_MAX = 10
_NUMBER = r"(0|[1-9][0-9]*)"


@dataclass(frozen=True, order=True)
class ReleaseNumber:
    major: int
    minor: int
    patch: int

    def __post_init__(self):
        if self.major < 0 or not 0 <= self.minor <= MINOR_MAX or not 0 <= self.patch <= PATCH_MAX:
            raise ValueError("Release counters require major >= 0, minor 0..10, patch 0..100.")

    @classmethod
    def parse(cls, value: str, *, legacy=False):
        suffix = r"(?:rc[1-9][0-9]*)?" if legacy else ""
        match = re.fullmatch(_NUMBER + r"\." + _NUMBER + r"\." + _NUMBER + suffix, value)
        if not match:
            raise ValueError("Use a numeric X-DDE version, for example 0.1.1.")
        return cls(*(int(part) for part in match.groups()))

    def next(self):
        if self.patch < PATCH_MAX:
            return ReleaseNumber(self.major, self.minor, self.patch + 1)
        if self.minor < MINOR_MAX:
            return ReleaseNumber(self.major, self.minor + 1, 0)
        return ReleaseNumber(self.major + 1, 0, 0)

    def __str__(self):
        return f"{self.major}.{self.minor}.{self.patch}"
