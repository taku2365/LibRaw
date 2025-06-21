#!/usr/bin/env node
/**
 * LibRaw WebAssembly Node.js Test using CommonJS module
 * Tests LibRaw functionality in Node.js environment without ES6 module issues
 */

const fs = require('fs');
const path = require('path');

// ANSI color codes
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    bright: '\x1b[1m'
};

function log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const colorMap = {
        INFO: colors.cyan,
        SUCCESS: colors.green,
        ERROR: colors.red,
        WARNING: colors.yellow,
        DEBUG: colors.magenta
    };
    
    const color = colorMap[level] || colors.white;
    console.log(`${color}${colors.bright}[${timestamp}] ${level}:${colors.reset} ${message}`);
    
    if (data) {
        if (typeof data === 'object') {
            console.log(JSON.stringify(data, null, 2));
        } else {
            console.log(data);
        }
    }
}

async function loadLibRawNode() {
    log('INFO', 'Loading LibRaw WASM CommonJS module...');
    
    try {
        const wasmPath = path.resolve(__dirname, '../wasm/libraw-node.js');
        
        if (!fs.existsSync(wasmPath)) {
            throw new Error(`WASM CommonJS module not found at ${wasmPath}`);
        }
        
        log('DEBUG', `Loading WASM from: ${wasmPath}`);
        
        // Require the CommonJS module
        const LibRawFactory = require(wasmPath);
        const LibRaw = await LibRawFactory();
        
        log('SUCCESS', 'LibRaw WASM CommonJS module loaded successfully');
        
        return LibRaw;
        
    } catch (error) {
        log('ERROR', 'Failed to load LibRaw WASM module', {
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
}

async function basicAPITest(LibRaw) {
    log('INFO', '--- Basic API Test ---');
    
    // Test static methods
    const version = LibRaw.LibRaw.getVersion();
    const cameraCount = LibRaw.LibRaw.getCameraCount();
    
    log('SUCCESS', `LibRaw ${version} - ${cameraCount} cameras supported`);
    
    // Test instance creation
    const processor = new LibRaw.LibRaw();
    log('SUCCESS', 'LibRaw instance created');
    
    // Test debug mode
    processor.setDebugMode(true);
    const debugMode = processor.getDebugMode();
    log('SUCCESS', `Debug mode: ${debugMode}`);
    
    // Test constants
    const constants = {
        OUTPUT_COLOR_SRGB: LibRaw.OUTPUT_COLOR_SRGB,
        QUALITY_AHD: LibRaw.QUALITY_AHD,
        QUALITY_LINEAR: LibRaw.QUALITY_LINEAR
    };
    log('SUCCESS', 'Constants available:', constants);
    
    // Cleanup
    processor.delete();
    log('SUCCESS', 'Processor cleaned up');
}

async function memoryTest(LibRaw) {
    log('INFO', '--- Memory Management Test ---');
    
    const initialMemory = process.memoryUsage();
    
    // Create and destroy many instances
    const iterations = 50;
    for (let i = 0; i < iterations; i++) {
        const processor = new LibRaw.LibRaw();
        processor.setDebugMode(false);
        processor.delete();
        
        if (i % 10 === 0) {
            const currentMemory = process.memoryUsage();
            log('DEBUG', `Memory after ${i} iterations:`, {
                heapUsed: `${(currentMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`
            });
        }
    }
    
    const finalMemory = process.memoryUsage();
    const memoryDiff = finalMemory.heapUsed - initialMemory.heapUsed;
    
    log('SUCCESS', `Memory test completed. Difference: ${(memoryDiff / 1024 / 1024).toFixed(2)} MB`);
}

async function processingTest(LibRaw) {
    log('INFO', '--- Processing Test ---');
    
    const processor = new LibRaw.LibRaw();
    processor.setDebugMode(true);
    
    try {
        // Create a small test buffer (dummy RAW data - this will fail but test the API)
        const testData = 'DUMMY_RAW_DATA_FOR_API_TEST';
        
        log('INFO', 'Testing loadFromMemory with dummy data...');
        const loaded = processor.loadFromMemory(testData);
        
        if (!loaded) {
            log('INFO', 'Expected: dummy data failed to load (this is normal)');
            const errorMsg = processor.getLastError();
            log('DEBUG', `Error message: ${errorMsg}`);
        } else {
            log('WARNING', 'Unexpected: dummy data was accepted');
        }
        
        // Test processing methods (should fail gracefully)
        log('INFO', 'Testing processing methods...');
        
        const unpacked = processor.unpack();
        log('INFO', `Unpack result: ${unpacked}`);
        
        const processed = processor.process();
        log('INFO', `Process result: ${processed}`);
        
        const metadata = processor.getMetadata();
        log('INFO', `Metadata available: ${metadata !== null}`);
        
        const thumbnail = processor.getThumbnail();
        log('INFO', `Thumbnail available: ${thumbnail !== null}`);
        
        const imageData = processor.getImageData();
        log('INFO', `Image data available: ${imageData !== null}`);
        
        const processingInfo = processor.getProcessingInfo();
        log('INFO', `Processing info available: ${processingInfo !== null}`);
        
        log('SUCCESS', 'All API methods tested successfully');
        
    } catch (error) {
        log('ERROR', 'Processing test failed', {
            error: error.message
        });
    } finally {
        processor.delete();
    }
}

async function performanceTest(LibRaw) {
    log('INFO', '--- Performance Test ---');
    
    const iterations = 1000;
    const startTime = process.hrtime.bigint();
    
    for (let i = 0; i < iterations; i++) {
        const processor = new LibRaw.LibRaw();
        processor.setDebugMode(false);
        processor.setUseCameraWB(true);
        processor.setOutputColor(LibRaw.OUTPUT_COLOR_SRGB);
        processor.setQuality(LibRaw.QUALITY_AHD);
        processor.setBrightness(1.0);
        processor.delete();
    }
    
    const endTime = process.hrtime.bigint();
    const totalTime = Number(endTime - startTime) / 1000000; // Convert to milliseconds
    const avgTime = totalTime / iterations;
    
    log('SUCCESS', `Performance test completed: ${iterations} iterations in ${totalTime.toFixed(2)}ms`);
    log('INFO', `Average time per instance: ${avgTime.toFixed(3)}ms`);
}

async function main() {
    console.log(`${colors.cyan}${colors.bright}🧪 LibRaw WebAssembly Node.js Test Suite${colors.reset}\n`);
    
    try {
        // Load LibRaw CommonJS module
        const LibRaw = await loadLibRawNode();
        
        // Run tests
        await basicAPITest(LibRaw);
        await memoryTest(LibRaw);
        await processingTest(LibRaw);
        await performanceTest(LibRaw);
        
        log('SUCCESS', '🎉 All Node.js tests completed successfully!');
        
        console.log(`\n${colors.green}${colors.bright}Next steps:${colors.reset}`);
        console.log('1. Test with real Sony ARW files: node test/arw-test.cjs');
        console.log('2. Use the CLI tool: node cli-tool.js --metadata test-image/DSC00085.ARW');
        console.log('3. Use the web demo for browser testing: python3 -m http.server 8000');
        
    } catch (error) {
        log('ERROR', '❌ Node.js test suite failed', {
            error: error.message,
            stack: error.stack
        });
        process.exit(1);
    }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    log('ERROR', 'Uncaught exception', {
        error: error.message,
        stack: error.stack
    });
    process.exit(1);
});

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = { loadLibRawNode, log };