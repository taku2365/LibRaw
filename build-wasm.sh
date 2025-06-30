#!/bin/bash
# LibRaw WebAssembly Build Script

set -e

echo "Building LibRaw for WebAssembly..."

# Check if local emsdk exists and source it
if [ -f "../../emsdk/emsdk_env.sh" ]; then
    echo "Activating local Emscripten SDK..."
    source ../../emsdk/emsdk_env.sh
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

# Determine build target
BUILD_TARGET="${1:-all}"

if [ "$BUILD_TARGET" = "browser" ] || [ "$BUILD_TARGET" = "all" ]; then
    echo "Building LibRaw WebAssembly module for browser (ES6)..."
    make -f Makefile.emscripten -j$(nproc)
fi

if [ "$BUILD_TARGET" = "node" ] || [ "$BUILD_TARGET" = "all" ]; then
    echo "Building LibRaw WebAssembly module for Node.js (CommonJS)..."
    make -f Makefile.emscripten.node -j$(nproc)
fi

# Check if build succeeded
SUCCESS=true
if [ "$BUILD_TARGET" = "browser" ] || [ "$BUILD_TARGET" = "all" ]; then
    if [ ! -f "wasm/libraw.js" ]; then
        echo "Browser build failed!"
        SUCCESS=false
    fi
fi

if [ "$BUILD_TARGET" = "node" ] || [ "$BUILD_TARGET" = "all" ]; then
    if [ ! -f "wasm/libraw-node.js" ]; then
        echo "Node.js build failed!"
        SUCCESS=false
    fi
fi

if [ "$SUCCESS" = true ]; then
    echo "Build successful!"
    echo ""
    echo "Files generated:"
    [ -f "wasm/libraw.js" ] && echo "  - wasm/libraw.js (ES6 module for browser/worker)"
    [ -f "wasm/libraw-node.js" ] && echo "  - wasm/libraw-node.js (CommonJS module for Node.js)"
    echo ""
    echo "To test the demo:"
    echo "  1. Start a local web server:"
    echo "     npm run serve"
    echo "  2. Open http://localhost:8000/web/"
    echo ""
    echo "To run tests:"
    echo "  npm test"
    echo ""
else
    echo "Build failed!"
    exit 1
fi