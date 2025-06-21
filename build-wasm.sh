#!/bin/bash
# LibRaw WebAssembly Build Script

set -e

echo "Building LibRaw for WebAssembly..."

# Check if local emsdk exists and source it
if [ -f "../emsdk/emsdk_env.sh" ]; then
    echo "Activating local Emscripten SDK..."
    source ../emsdk/emsdk_env.sh
fi

# Check if Emscripten is available
if ! command -v emcc &> /dev/null; then
    echo "Error: Emscripten not found. Please install and activate emsdk."
    echo "Visit: https://emscripten.org/docs/getting_started/downloads.html"
    exit 1
fi

# Display Emscripten version
echo "Using Emscripten version:"
emcc --version

# Clean previous build
echo "Cleaning previous build..."
make -f Makefile.emscripten clean || true

# Create necessary directories
mkdir -p object lib wasm web

# Build LibRaw WASM
echo "Building LibRaw WebAssembly module..."
make -f Makefile.emscripten -j$(nproc)

# Check if build succeeded
if [ -f "wasm/libraw.js" ]; then
    echo "Build successful!"
    echo ""
    echo "Files generated:"
    echo "  - wasm/libraw.js (ES6 module)"
    echo "  - wasm/libraw.wasm (embedded in JS)"
    echo ""
    echo "To test the demo:"
    echo "  1. Start a local web server:"
    echo "     python3 -m http.server 8000"
    echo "  2. Open http://localhost:8000/web/"
    echo ""
else
    echo "Build failed!"
    exit 1
fi