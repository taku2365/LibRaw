/* LibRaw WebAssembly stubs for file-based operations
 * These functions are stubbed out since we don't support file operations in WASM
 */

#include "../internal/libraw_cxx_defs.h"

// Stub implementations for file-based operations
void LibRaw::bad_pixels(const char *fname) {
    // No-op: bad pixel removal from file not supported in WASM
    return;
}

void LibRaw::subtract(const char *fname) {
    // No-op: dark frame subtraction from file not supported in WASM
    return;
}