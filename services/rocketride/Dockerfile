# RocketRide engine, patched for amd64-under-emulation (Apple Silicon).
#
# The stock engine bootstraps `uv` at startup via `pip install uv`. On an
# emulated amd64 container that install lands a 0-byte `/opt/rocketride/bin/uv`,
# so `uv pip compile` fails with `OSError: [Errno 8] Exec format error` and the
# engine never passes its healthcheck (:5565 stays closed).
#
# depends.py's `_ensure_uv()` only checks `os.path.isfile()` before reusing an
# existing uv, so pre-seeding a known-good glibc amd64 uv makes it skip the
# broken pip install entirely.
FROM ghcr.io/rocketride-org/rocketride-engine:latest

# ADD lands the tarball as root:0600; the engine runs as `rocketride`, so do the
# patch as root and restore the original user afterward.
USER root
ARG UV_VERSION=0.11.27
ADD https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-x86_64-unknown-linux-gnu.tar.gz /tmp/uv.tar.gz
RUN install -d -o rocketride /opt/rocketride/bin \
 && tar -xzf /tmp/uv.tar.gz -C /tmp \
 && install -m 0755 -o rocketride /tmp/uv-x86_64-unknown-linux-gnu/uv  /opt/rocketride/bin/uv \
 && install -m 0755 -o rocketride /tmp/uv-x86_64-unknown-linux-gnu/uvx /opt/rocketride/bin/uvx \
 && rm -rf /tmp/uv.tar.gz /tmp/uv-x86_64-unknown-linux-gnu \
 && /opt/rocketride/bin/uv --version
USER rocketride
