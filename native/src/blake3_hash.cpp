#include <blake3.h>
#include <cstdint>

extern "C" {
    // One function: hash input and return 32 bytes
    void blake3_hash(const uint8_t* input, size_t len, uint8_t* output) {
        blake3_hasher hasher;
        blake3_hasher_init(&hasher);
        blake3_hasher_update(&hasher, input, len);
        blake3_hasher_finalize(&hasher, output, 32);
    }
}