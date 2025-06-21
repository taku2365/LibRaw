# LibRaw WebAssembly Build

This directory contains the WebAssembly build configuration for LibRaw, enabling high-performance RAW image processing directly in web browsers with JPEG export functionality.

## Prerequisites

1. **Emscripten SDK**: Install from https://emscripten.org/docs/getting_started/downloads.html
   ```bash
   git clone https://github.com/emscripten-core/emsdk.git
   cd emsdk
   ./emsdk install latest
   ./emsdk activate latest
   source ./emsdk_env.sh
   ```

2. **zlib**: The build expects zlib to be available for Emscripten

## Building

Run the build script:
```bash
./build-wasm.sh
```

Or build manually:
```bash
make -f Makefile.emscripten
```

## Files Structure

```
LibRaw/
├── wasm/                  # WASM-specific source files
│   ├── libraw_wasm_wrapper.cpp  # C++ bindings for JavaScript
│   ├── libraw_wasm_stubs.cpp    # Stub implementations
│   ├── libraw.js              # ES6 WASM module (browser)
│   └── libraw-node.js         # CommonJS WASM module (Node.js)
├── web/                   # Interactive web demo
│   ├── index.html        # Full-featured demo with JPEG export
│   └── libraw-wasm.js    # High-level JavaScript API wrapper
├── test/                  # Comprehensive test suite
│   ├── arw-working-test.cjs      # Sony ARW processing test
│   ├── browser-simulation.cjs   # Browser environment simulation
│   ├── jpeg-download-test.cjs   # JPEG export functionality test
│   └── e2e/                     # End-to-end browser tests
├── server.js              # Development HTTP server with WASM headers
├── cli-tool.js           # Command-line RAW processing tool
├── package.json          # Node.js dependencies and scripts
├── playwright.config.js  # Cross-browser testing configuration
├── Makefile.emscripten   # Emscripten build configuration
└── build-wasm.sh         # Automated build script
```

## Usage

### Basic Example

```javascript
import { LibRawJS } from './libraw-wasm.js';

// Initialize LibRaw
const libraw = new LibRawJS();
await libraw.init('./libraw.js');

// Load and process a RAW file
const response = await fetch('sample.cr2');
const buffer = await response.arrayBuffer();

const image = await libraw.loadRAW(buffer);
await image.process({
    useCameraWB: true,
    outputColor: 1, // sRGB
    quality: 3      // AHD interpolation
});

// Get processed image data
const imageData = image.getImageData();

// Export as JPEG with quality control
const jpegDataUrl = await image.getDataURL('jpeg', 0.85); // 85% quality
const pngDataUrl = await image.getDataURL('png');

// Display the image
document.getElementById('output').src = jpegDataUrl;

// Download as JPEG file
const link = document.createElement('a');
link.href = jpegDataUrl;
link.download = 'processed_image.jpg';
link.click();

// Don't forget to clean up
image.dispose();
```

### API Reference

#### LibRawJS Class

- `init(moduleOrPath)`: Initialize the WASM module
- `loadRAW(buffer)`: Load a RAW file from ArrayBuffer
- `getVersion()`: Get LibRaw version string
- `getCameraCount()`: Get number of supported cameras
- `getCameraList()`: Get array of supported camera models

#### LibRawImage Class

- `load(buffer)`: Load RAW data
- `process(options)`: Process the RAW image
- `getImageData()`: Get processed RGB data
- `getDataURL(format, quality)`: Get image as data URL (supports 'png', 'jpeg' with quality 0.0-1.0)
- `getMetadata()`: Get image metadata
- `getThumbnail()`: Get embedded thumbnail
- `dispose()`: Clean up resources

#### Processing Options

- `useAutoWB`: Use automatic white balance
- `useCameraWB`: Use camera white balance
- `outputColor`: Output color space (0-5)
- `brightness`: Brightness adjustment (0.5-2.0)
- `quality`: Interpolation quality (0-11)
- `halfSize`: Process at half resolution

## Quick Start

### Web Demo

1. Start the development server:
   ```bash
   npm run serve
   # or
   node server.js
   ```

2. Open http://localhost:8000/web/ in your browser

3. Drag and drop a RAW file (ARW, CR2, NEF, DNG, etc.)

4. Adjust processing settings and quality

5. Click "Process RAW" to generate the image

6. Use "Preview JPEG" to test quality settings

7. Click "Download JPEG" to save the processed image

### Command Line Tool

Process RAW files from the command line:
```bash
# Extract metadata
node cli-tool.js --metadata sample.arw

# Process with custom settings  
node cli-tool.js --process sample.arw --output output.jpg --quality 85

# Batch processing
node cli-tool.js --batch *.arw --output-dir ./processed/
```

### Running Tests

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:node        # Node.js tests
npm run test:browser-sim # Browser simulation
npm run test:playwright  # Cross-browser tests

# Test Sony ARW processing
npm run test:arw
```

## Limitations

- No file system access (memory-based processing only)
- Single-threaded processing (no OpenMP)
- Limited to basic processing features
- Memory constraints for large files (>100MB)
- Some advanced features disabled for size optimization

## Performance

### Verified Test Results (Sony ARW - 78.77MB)

- **Initial load**: ~2-3 seconds (WASM module initialization)
- **File loading**: ~60ms (binary-safe Uint8Array method)
- **RAW unpacking**: ~1.7 seconds (Bayer pattern extraction)
- **Image processing**: ~10 seconds (AHD demosaic, color conversion)
- **JPEG generation**: ~1-2 seconds (Canvas-based encoding)
- **Total processing**: ~12 seconds for 78.77MB Sony ILCE-7RM5 file
- **Throughput**: ~6.7 MB/s sustained processing speed
- **Memory usage**: ~3-4x the RAW file size
- **Output size**: 4783×3187 pixels from 9728×6656 RAW

### Performance Tips

- Use `halfSize: true` for faster processing (reduces resolution)
- Choose `QUALITY_LINEAR` for speed, `QUALITY_AHD` for quality
- Enable camera white balance for consistent results
- Process in smaller batches for memory efficiency

## Browser Support

- Chrome 61+
- Firefox 58+
- Safari 11+
- Edge 79+

WebAssembly and ES6 modules required.

## New Features

### JPEG Export Functionality
- **Quality Control**: Adjustable JPEG quality from 10% to 100%
- **Real-time Preview**: Preview JPEG compression before download
- **Automatic Naming**: Smart filename generation with camera model and timestamp
- **File Size Estimation**: Live file size preview based on quality settings
- **One-click Download**: Direct browser download with proper MIME types

### Enhanced Web Interface
- **Drag & Drop**: Intuitive file loading with visual feedback
- **Processing Controls**: Real-time adjustment of white balance, color space, quality
- **Status Indicators**: Live processing status with progress feedback
- **Responsive Design**: Works on desktop and tablet devices
- **Error Handling**: Comprehensive error messages and recovery

### Development Tools
- **Comprehensive Testing**: Node.js, browser simulation, and cross-browser tests
- **CLI Tool**: Command-line interface for batch processing
- **Development Server**: Custom HTTP server with proper WASM headers
- **Cross-Platform**: Works on Windows, macOS, Linux, and WSL

## Supported Formats

### Extensively Tested
- **Sony ARW**: ILCE-7RM5 and other Alpha series cameras
- **Canon CR2/CR3**: EOS series RAW formats
- **Nikon NEF**: D-series and Z-series cameras
- **Adobe DNG**: Standard digital negative format

### Additional Support
- **Fuji RAF**: X-series cameras
- **Olympus ORF**: Micro Four Thirds
- **Panasonic RW2**: Lumix series
- **Pentax PEF**: K-series cameras
- **And 500+ more camera models**

## Troubleshooting

### Common Issues

1. **CORS errors**: Ensure you're serving from a web server, not file://
   ```bash
   # Use the included server
   node server.js
   # or Python
   python3 -m http.server 8000
   ```

2. **Memory errors**: Try enabling `halfSize` option for large files
   ```javascript
   await image.process({ halfSize: true });
   ```

3. **Unsupported format**: Check camera support
   ```javascript
   const cameras = libraw.getCameraList();
   console.log('Supported cameras:', cameras.length);
   ```

4. **Slow processing**: Optimize settings for speed
   ```javascript
   await image.process({
       quality: 0,        // Linear interpolation (fastest)
       halfSize: true,    // Half resolution
       useCameraWB: true  // Skip auto white balance
   });
   ```

5. **WASM loading fails**: Check browser compatibility and HTTPS
   - Ensure modern browser (Chrome 61+, Firefox 58+, Safari 11+)
   - Use HTTPS in production (required for SharedArrayBuffer)
   - Check network connectivity for WASM module download

### WSL/Linux Issues

6. **Playwright browser tests fail**: Use browser simulation
   ```bash
   npm run test:browser-sim  # Uses JSDOM instead of real browsers
   ```

7. **Emscripten not found**: Install and source Emscripten SDK
   ```bash
   git clone https://github.com/emscripten-core/emsdk.git
   cd emsdk && ./emsdk install latest && ./emsdk activate latest
   source ./emsdk_env.sh
   ```

## Technical Details

### Build Configuration
- **Dual Module System**: ES6 modules for browsers, CommonJS for Node.js
- **Memory Management**: Automatic cleanup with typed memory views
- **Binary Safety**: Uint8Array-based file loading prevents data corruption
- **Size Optimization**: Single-file WASM bundle with embedded dependencies
- **Cross-Origin Support**: COOP/COEP headers for SharedArrayBuffer compatibility

### Architecture
- **C++ Core**: LibRaw with Emscripten bindings
- **JavaScript Wrapper**: High-level API with Promise-based operations
- **Canvas Integration**: Direct browser Canvas API for image output
- **Memory Pools**: Efficient memory allocation for large RAW files
- **Error Recovery**: Graceful handling of memory and processing errors

### Recent Bug Fixes
- Fixed `subarray` memory access error in `getImageData()` and `getThumbnail()`
- Replaced deprecated WASM memory access patterns with `typed_memory_view()`
- Improved binary-safe data handling preventing 78MB→125MB data corruption
- Enhanced error reporting with detailed processing status

## Future Roadmap

### Short-term Improvements
- **WebWorker Support**: Background processing without blocking UI
- **Progressive Loading**: Stream processing for very large files
- **Advanced Controls**: Exposure compensation, highlight recovery
- **Batch Processing**: Multi-file processing with progress tracking

### Long-term Goals
- **GPU Acceleration**: WebGL-based demosaic algorithms
- **Real-time Preview**: Live RAW processing preview
- **Cloud Integration**: Server-side processing for mobile devices
- **Plugin System**: Extensible processing pipeline

### Additional Format Support
- **Medium Format**: Phase One, Hasselblad, Mamiya
- **Smartphone RAW**: iPhone ProRAW, Android Camera2 API
- **Video RAW**: Basic CinemaDNG support
- **Legacy Formats**: Older camera models and specialized formats

## Contributing

We welcome contributions! Please:

1. **Test thoroughly** - Run the full test suite
2. **Document changes** - Update README and inline comments
3. **Follow conventions** - Match existing code style
4. **Add tests** - Include test cases for new features
5. **Check performance** - Ensure no regression in processing speed

### Development Setup
```bash
# Clone and install dependencies
git clone https://github.com/your-repo/LibRaw.git
cd LibRaw
npm install

# Install Emscripten SDK
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk && ./emsdk install latest && ./emsdk activate latest
source ./emsdk_env.sh

# Build and test
./build-wasm.sh
npm test
```

## License

Same as LibRaw - dual licensed under LGPL 2.1 and CDDL 1.0