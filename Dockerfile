# --- STAGE 1: The Builder ---
FROM oven/bun:1.1-slim AS builder

RUN apt-get update && apt-get install -y \
    build-essential cmake git curl zip unzip tar pkg-config python3 clang \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt
RUN git clone https://github.com/microsoft/vcpkg.git && ./vcpkg/bootstrap-vcpkg.sh
ENV VCPKG_ROOT=/opt/vcpkg

WORKDIR /app

# Install dependencies (using standard x64-linux dynamic)
COPY ./native/vcpkg.json* ./native/vcpkg-configuration.json* ./native/
RUN if [ -f "./native/vcpkg.json" ]; then \
    ${VCPKG_ROOT}/vcpkg install --x-manifest-root=./native --triplet=x64-linux; \
    fi

COPY ./native ./native
RUN --mount=type=cache,target=/tmp/native-build-cache \
    cd native && \
    mkdir -p build && \
    cmake -S . -B /tmp/native-build-cache \
    -DCMAKE_CXX_COMPILER=clang++ \
    -DCMAKE_TOOLCHAIN_FILE=${VCPKG_ROOT}/scripts/buildsystems/vcpkg.cmake \
    -DCMAKE_BUILD_TYPE=Release && \
    cmake --build /tmp/native-build-cache -- -j$(nproc) && \
    # Move only your compiled .so
    cp -a /tmp/native-build-cache/*.so /app/native/build/ && \
    # Only copy vcpkg libs IF they exist, don't crash if they don't
    if [ -d "/opt/vcpkg/installed/x64-linux/lib" ]; then \
      cp -a /opt/vcpkg/installed/x64-linux/lib/*.so* /app/native/build/ || true; \
    fi
# --- STAGE 2: The Runtime ---
FROM oven/bun:1.1-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1. Copy everything
COPY . .
# 2. Copy the built native folder from Stage 1
COPY --from=builder /app/native/build /app/native/build

# 3. TELL LINUX TO LOOK IN YOUR LOCAL FOLDER
# This environment variable is the "Google-scale" way to handle local shared libs
ENV LD_LIBRARY_PATH=/app/native/build:$LD_LIBRARY_PATH

# 4. Diagnostic: Check if it can find them locally
RUN ldd /app/native/build/libtwivo_native.so

EXPOSE 3000

CMD ["bun", "run", "server.js"]