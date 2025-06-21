#!/usr/bin/env node
/**
 * LibRaw WebAssembly Node.js Test
 * Tests LibRaw WASM module in Node.js environment
 */

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const readFile = promisify(fs.readFile);

// ANSI color codes for output
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

function log(level, message) {
    const colorMap = {
        INFO: colors.cyan,
        SUCCESS: colors.green,
        ERROR: colors.red,
        WARNING: colors.yellow,
        TEST: colors.magenta
    };
    
    const color = colorMap[level] || colors.white;
    console.log(`${color}${colors.bright}[${level}]${colors.reset} ${message}`);
}

async function loadLibRawWASM() {
    log('INFO', 'Loading LibRaw WASM module for Node.js...');
    
    try {
        const wasmPath = path.resolve(__dirname, '../wasm/libraw-node.js');
        if (!fs.existsSync(wasmPath)) {
            throw new Error(`libraw-node.js not found at ${wasmPath}`);
        }
        
        const LibRawFactory = require(wasmPath);
        const LibRaw = await LibRawFactory();
        
        log('SUCCESS', `LibRaw ${LibRaw.LibRaw.getVersion()} loaded`);
        log('INFO', `${LibRaw.LibRaw.getCameraCount()} cameras supported`);
        
        return LibRaw;
    } catch (error) {
        log('ERROR', `Failed to load LibRaw WASM: ${error.message}`);
        throw error;
    }
}

async function testBasicFunctionality(LibRaw) {
    log('TEST', 'Testing basic LibRaw functionality...');
    
    const tests = [
        {
            name: 'Get version',
            test: () => {
                const version = LibRaw.LibRaw.getVersion();
                // Version format: "0.22.0-Devel202502"
                return version && typeof version === 'string' && version.length > 0;
            }
        },
        {
            name: 'Get camera count',
            test: () => {
                const count = LibRaw.LibRaw.getCameraCount();
                return count > 1000; // LibRaw supports over 1000 cameras
            }
        },
        {
            name: 'Get camera list',
            test: () => {
                const list = LibRaw.LibRaw.getCameraList();
                return Array.isArray(list) && list.length > 1000;
            }
        },
        {
            name: 'Create processor instance',
            test: () => {
                const processor = new LibRaw.LibRaw();
                const valid = processor !== null && typeof processor.delete === 'function';
                processor.delete();
                return valid;
            }
        }
    ];
    
    let passed = 0;
    for (const test of tests) {
        try {
            const result = test.test();
            if (result) {
                log('SUCCESS', `✓ ${test.name}`);
                passed++;
            } else {
                log('ERROR', `✗ ${test.name}: Test returned false`);
            }
        } catch (error) {
            log('ERROR', `✗ ${test.name}: ${error.message}`);
        }
    }
    
    log('INFO', `Basic tests: ${passed}/${tests.length} passed`);
    return passed === tests.length;
}

async function testARWProcessing(LibRaw) {
    log('TEST', 'Testing Sony ARW processing...');
    
    const arwPath = path.resolve(__dirname, '../test-image/DSC00085.ARW');
    if (!fs.existsSync(arwPath)) {
        log('WARNING', 'ARW test file not found, skipping ARW tests');
        return true;
    }
    
    const fileBuffer = await readFile(arwPath);
    log('INFO', `Loaded ARW file: ${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB`);
    
    const processor = new LibRaw.LibRaw();
    processor.setDebugMode(false);
    
    try {
        // Use Uint8Array for LibRaw
        const uint8Array = new Uint8Array(fileBuffer);
        
        // Test loading
        log('INFO', 'Loading ARW data...');
        const loaded = processor.loadFromUint8Array(uint8Array);
        if (!loaded) {
            throw new Error('Failed to load ARW file');
        }
        log('SUCCESS', '✓ ARW file loaded');
        
        // Test metadata extraction
        log('INFO', 'Extracting metadata...');
        const metadata = processor.getMetadata();
        
        if (metadata.make !== 'Sony' || metadata.model !== 'ILCE-7RM5') {
            throw new Error(`Unexpected camera: ${metadata.make} ${metadata.model}`);
        }
        
        log('SUCCESS', '✓ Metadata extracted correctly');
        log('INFO', `  Camera: ${metadata.make} ${metadata.model}`);
        log('INFO', `  ISO: ${metadata.iso}`);
        log('INFO', `  Shutter: ${metadata.shutter}s`);
        log('INFO', `  Aperture: f/${metadata.aperture}`);
        log('INFO', `  Image: ${metadata.rawWidth}×${metadata.rawHeight}`);
        
        // Test unpacking
        log('INFO', 'Unpacking RAW data...');
        const unpacked = processor.unpack();
        if (!unpacked) {
            throw new Error('Failed to unpack RAW data');
        }
        log('SUCCESS', '✓ RAW data unpacked');
        
        // Test processing options
        processor.setUseCameraWB(true);
        processor.setOutputColor(1); // sRGB
        processor.setQuality(0); // Linear (fast)
        processor.setHalfSize(true); // Faster processing
        processor.setBrightness(1.0);
        
        // Test processing
        log('INFO', 'Processing image...');
        const startTime = Date.now();
        const processed = processor.process();
        const processTime = Date.now() - startTime;
        
        if (!processed) {
            throw new Error('Image processing failed');
        }
        
        log('SUCCESS', `✓ Image processed in ${processTime}ms`);
        
        return true;
        
    } catch (error) {
        log('ERROR', `ARW processing failed: ${error.message}`);
        return false;
    } finally {
        processor.delete();
    }
}

async function testPerformance(LibRaw) {
    log('TEST', 'Testing performance with different settings...');
    
    const arwPath = path.resolve(__dirname, '../test-image/DSC00085.ARW');
    if (!fs.existsSync(arwPath)) {
        log('WARNING', 'ARW test file not found, skipping performance tests');
        return true;
    }
    
    const fileBuffer = await readFile(arwPath);
    const uint8Array = new Uint8Array(fileBuffer);
    
    const tests = [
        {
            name: 'Linear interpolation + half size',
            options: { quality: 0, halfSize: true }
        },
        {
            name: 'VNG interpolation + full size',
            options: { quality: 1, halfSize: false }
        },
        {
            name: 'AHD interpolation + half size',
            options: { quality: 3, halfSize: true }
        }
    ];
    
    for (const test of tests) {
        const processor = new LibRaw.LibRaw();
        processor.setDebugMode(false);
        
        try {
            processor.loadFromUint8Array(uint8Array);
            processor.unpack();
            
            processor.setUseCameraWB(true);
            processor.setOutputColor(1);
            processor.setQuality(test.options.quality);
            processor.setHalfSize(test.options.halfSize);
            processor.setBrightness(1.0);
            
            const startTime = Date.now();
            const processed = processor.process();
            const processTime = Date.now() - startTime;
            
            if (processed) {
                log('SUCCESS', `✓ ${test.name}: ${processTime}ms`);
            } else {
                log('ERROR', `✗ ${test.name}: Processing failed`);
            }
            
        } catch (error) {
            log('ERROR', `✗ ${test.name}: ${error.message}`);
        } finally {
            processor.delete();
        }
    }
    
    return true;
}

async function testMemoryManagement(LibRaw) {
    log('TEST', 'Testing memory management...');
    
    // Test creating and deleting multiple instances
    const instances = [];
    
    try {
        // Create multiple instances
        for (let i = 0; i < 5; i++) {
            const processor = new LibRaw.LibRaw();
            instances.push(processor);
        }
        log('SUCCESS', '✓ Created 5 processor instances');
        
        // Delete all instances
        for (const processor of instances) {
            processor.delete();
        }
        log('SUCCESS', '✓ Deleted all processor instances');
        
        // Test with actual processing
        const arwPath = path.resolve(__dirname, '../test-image/DSC00085.ARW');
        if (fs.existsSync(arwPath)) {
            const fileBuffer = await readFile(arwPath);
            const uint8Array = new Uint8Array(fileBuffer);
            
            // Process multiple times to test memory cleanup
            for (let i = 0; i < 3; i++) {
                const processor = new LibRaw.LibRaw();
                processor.setDebugMode(false);
                
                processor.loadFromUint8Array(uint8Array);
                processor.unpack();
                processor.setHalfSize(true); // Use less memory
                processor.process();
                
                processor.delete();
                log('SUCCESS', `✓ Processing cycle ${i + 1} completed with cleanup`);
            }
        }
        
        return true;
        
    } catch (error) {
        log('ERROR', `Memory management test failed: ${error.message}`);
        return false;
    }
}

async function main() {
    console.log(`\n${colors.cyan}${colors.bright}🧪 LibRaw WebAssembly Node.js Test Suite${colors.reset}\n`);
    
    const results = {
        loadModule: false,
        basicFunctionality: false,
        arwProcessing: false,
        performance: false,
        memoryManagement: false
    };
    
    try {
        // Load module
        const LibRaw = await loadLibRawWASM();
        results.loadModule = true;
        
        // Run tests
        results.basicFunctionality = await testBasicFunctionality(LibRaw);
        results.arwProcessing = await testARWProcessing(LibRaw);
        results.performance = await testPerformance(LibRaw);
        results.memoryManagement = await testMemoryManagement(LibRaw);
        
    } catch (error) {
        log('ERROR', `Test suite failed: ${error.message}`);
    }
    
    // Summary
    console.log(`\n${colors.cyan}${colors.bright}📊 Test Results Summary${colors.reset}\n`);
    
    let totalPassed = 0;
    const totalTests = Object.keys(results).length;
    
    for (const [test, passed] of Object.entries(results)) {
        const status = passed ? `${colors.green}✓ PASS` : `${colors.red}✗ FAIL`;
        console.log(`${status}${colors.reset} ${test}`);
        if (passed) totalPassed++;
    }
    
    const allPassed = totalPassed === totalTests;
    const summaryColor = allPassed ? colors.green : colors.red;
    
    console.log(`\n${summaryColor}${colors.bright}Total: ${totalPassed}/${totalTests} tests passed${colors.reset}`);
    
    if (allPassed) {
        console.log(`\n${colors.green}${colors.bright}🎉 All tests passed!${colors.reset}`);
    } else {
        console.log(`\n${colors.red}${colors.bright}❌ Some tests failed${colors.reset}`);
    }
    
    return allPassed;
}

// Run tests if called directly
if (require.main === module) {
    main().then(success => {
        process.exit(success ? 0 : 1);
    }).catch(error => {
        log('ERROR', `Unhandled error: ${error.message}`);
        process.exit(1);
    });
}

module.exports = { loadLibRawWASM, testBasicFunctionality, testARWProcessing };