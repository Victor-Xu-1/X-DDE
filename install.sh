#!/usr/bin/env bash
# Install a verified GitHub release without requiring Node, Git or a source checkout.
set -euo pipefail
release="${1:-v0.4.0rc1}"
prefix="${2:-$HOME/.local/share/opendde-workbench/app}"
case "$release" in v[0-9]*) ;; *) echo 'Expected a version tag, for example v0.4.0rc1' >&2; exit 2;; esac
[[ "$release" =~ ^v[0-9A-Za-z.-]+$ ]] || exit 2
[[ "$(uname -s)" == Linux && "$(uname -m)" == x86_64 ]] || { echo 'Use Linux x86-64 or Windows WSL2.' >&2; exit 2; }
command -v curl >/dev/null || { echo 'Install curl first: sudo apt-get install curl ca-certificates' >&2; exit 2; }
mkdir -p "$prefix/downloads" "$prefix/bin"
prefix="$(cd "$prefix" && pwd)"
fetch() { curl --fail --location --retry 2 --connect-timeout 20 --max-time 900 --proto '=https' --proto-redir '=https' "$1" -o "$2"; }
uvversion=0.12.20
uvbase="https://github.com/astral-sh/uv/releases/download/$uvversion"
archive="$prefix/downloads/uv-x86_64-unknown-linux-gnu.tar.gz"
fetch "$uvbase/uv-x86_64-unknown-linux-gnu.tar.gz" "$archive"
fetch "$uvbase/uv-x86_64-unknown-linux-gnu.tar.gz.sha256" "$archive.sha256"
expected="$(cut -d ' ' -f1 "$archive.sha256")"
[[ "$expected" =~ ^[a-f0-9]{64}$ ]] || exit 2
printf '%s  %s\n' "$expected" "$archive" | sha256sum --check
tar -xzf "$archive" -C "$prefix/downloads" --no-same-owner
install -m 0755 "$prefix/downloads/uv-x86_64-unknown-linux-gnu/uv" "$prefix/bin/uv"
base="https://github.com/Victor-Xu-1/X-DDE/releases/download/$release"
wheel="x_dde-${release#v}-py3-none-any.whl"
fetch "$base/$wheel" "$prefix/downloads/$wheel"
fetch "$base/SHA256SUMS" "$prefix/downloads/SHA256SUMS"
expected="$(awk -v filename="$wheel" '$2 == filename {print $1}' "$prefix/downloads/SHA256SUMS")"
[[ "$expected" =~ ^[a-f0-9]{64}$ ]] || { echo 'Release checksum not found.' >&2; exit 2; }
printf '%s  %s\n' "$expected" "$prefix/downloads/$wheel" | sha256sum --check
export UV_TOOL_DIR="$prefix/tools" UV_TOOL_BIN_DIR="$prefix/bin" UV_CACHE_DIR="$prefix/cache"
"$prefix/bin/uv" tool install --force --python 3.12 "$prefix/downloads/$wheel"
"$prefix/bin/xdde" version
profile_line="$(printf 'export PATH=%q:"$PATH"' "$prefix/bin")"
if ! grep -Fxq "$profile_line" "$HOME/.profile" 2>/dev/null; then
    printf '\n# X-DDE\n%s\n' "$profile_line" >> "$HOME/.profile"
fi
printf '\nInstalled. Run: export PATH="%s/bin:$PATH"\nThen: X-DDE UI\n' "$prefix"
