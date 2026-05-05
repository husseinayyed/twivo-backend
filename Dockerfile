# --- STAGE 1: The Builder ---
# We use a full environment to compile high-performance native code
FROM oven/bun:1.1-slim AS builder

# Install build dependencies
RUN apt-get update && apt-get install -y \
    build-essential cmake git curl zip unzip tar pkg-config python3 clang \
    && rm -rf /var/lib/apt/lists/*

# Setup vcpkg for C++ dependency management
WORKDIR /opt
RUN git clone https://github.com/microsoft/vcpkg.git && ./vcpkg/bootstrap-vcpkg.sh
ENV VCPKG_ROOT=/opt/vcpkg

WORKDIR /app

# Install vcpkg dependencies (Manifest mode)
COPY ./native/vcpkg.json* ./native/vcpkg-configuration.json* ./native/
RUN if [ -f "./native/vcpkg.json" ]; then \
    ${VCPKG_ROOT}/vcpkg install --x-manifest-root=./native --triplet=x64-linux; \
    fi

# Copy native source and compile
COPY ./native ./native
RUN cd native && \
    rm -rf build && \
    mkdir build && \
    cd build && \
    cmake .. -DCMAKE_CXX_COMPILER=clang++ -DCMAKE_TOOLCHAIN_FILE=${VCPKG_ROOT}/scripts/buildsystems/vcpkg.cmake -DCMAKE_BUILD_TYPE=Release && \
    make -j$(nproc)

# --- STAGE 2: The Runtime (Optimized for Performance & Security) ---
FROM oven/bun:1.1-slim

# Install only the bare-minimum runtime libraries (libstdc++ is vital for FFI)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1. Copy the JavaScript/Bun application source
COPY . .

# 2. Copy compiled .so binaries to the system library path
# This solves the "Failed to open library" error by using the OS search path
COPY --from=builder /app/native/build/libtwivo_native.so /usr/local/lib/
COPY --from=builder /app/native/build/libtwivo_blake3.so /usr/local/lib/

# 3. Register the libraries in the system dynamic linker cache
# This allows you to call dlopen("libtwivo_native.so") without full paths
RUN ldconfig

# 4. Set secure permissions (Executable by Bun, but not writable)
RUN chmod 755 /usr/local/lib/libtwivo_*.so

# 5. Final check to ensure libraries are resolvable
RUN ldd /usr/local/lib/libtwivo_native.so

EXPOSE 3000

# Use 'bun run' for the entry point
CMD ["bun", "run", "server.js"]