cmake_minimum_required(VERSION 3.17)
project(TwivoNative LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)
set(CMAKE_CXX_FLAGS "-O3 -march=native -mtune=native -fPIC")

# Find Dependencies
find_package(blake3 CONFIG REQUIRED)
find_package(protobuf CONFIG REQUIRED)

# The absolute path to your generated protobuf files
set(PROTO_SRC_DIR "${CMAKE_CURRENT_SOURCE_DIR}/./protobuf/src")

include_directories(${PROTO_SRC_DIR})

# Add the library
add_library(twivo_blake3 SHARED
    src/blake3_hash.cpp 
)

add_library(twivo_native SHARED 
    src/protobuf_core.cpp
    "${PROTO_SRC_DIR}/twivo.user.pb.cc" 
)

# Link Libraries
# vcpkg uses protobuf::libprotobuf
target_link_libraries(twivo_native 
    PRIVATE 
    BLAKE3::blake3
    protobuf::libprotobuf
)
target_link_libraries(twivo_blake3
    PRIVATE 
    BLAKE3::blake3
)