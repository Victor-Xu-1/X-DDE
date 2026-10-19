FROM @PYTHON_IMAGE@ AS wheel-builder
RUN apt-get update && apt-get install -y --no-install-recommends gcc libc6-dev \
    && dpkg-query -W gcc libc6-dev > /tmp/native-build-system.txt \
    && rm -rf /var/lib/apt/lists/*
COPY build-requirements.txt /tmp/build-requirements.txt
RUN python -m pip install --no-cache-dir --only-binary=:all: --require-hashes \
    -r /tmp/build-requirements.txt && python -m pip check
COPY requirements.txt /tmp/requirements.txt
# Input artifacts are hash-locked. Build isolation cannot fetch unreviewed dependencies.
RUN python -m pip wheel --no-cache-dir --no-build-isolation --no-deps --require-hashes \
    -r /tmp/requirements.txt --wheel-dir /wheelhouse \
    && cd /wheelhouse && sha256sum *.whl > SHA256SUMS

FROM @PYTHON_IMAGE@
COPY --from=wheel-builder /wheelhouse /wheelhouse
COPY --from=wheel-builder /tmp/native-build-system.txt /usr/local/share/x-dde/native-build-system.txt
COPY requirements.txt /usr/local/share/x-dde/native-requirements.txt
COPY build-requirements.txt /usr/local/share/x-dde/native-build-requirements.txt
RUN cd /wheelhouse && sha256sum --check SHA256SUMS \
    && python -m pip install --no-cache-dir --no-index --no-deps /wheelhouse/*.whl \
    && python -m pip check \
    && python -c "from importlib.metadata import version; from DockQ.DockQ import calc_DockQ; assert version('dockq') == '2.1.3'" \
    && rm -rf /wheelhouse
LABEL org.xdde.biopython.version="@VERSION@" \
      org.xdde.biopython.runtime-lock="@RUNTIME_LOCK@" \
      org.xdde.biopython.build-lock="@BUILD_LOCK@"
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /output
