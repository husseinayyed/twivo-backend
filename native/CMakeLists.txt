cmake_minimum_required(VERSION 3.20)
project(Blake3Hash LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)
set(CMAKE_CXX_COMPILER "clang++")
set(CMAKE_C_COMPILER "clang")
set(CMAKE_CXX_FLAGS "-O3 -march=native -mtune=native")

find_package(blake3 CONFIG REQUIRED)

add_library(blake3_hash SHARED src/blake3_hash.cpp)

# Correct target name from vcpkg's output
target_link_libraries(blake3_hash PRIVATE BLAKE3::blake3)