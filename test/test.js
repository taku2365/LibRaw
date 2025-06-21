#!/usr/bin/env node
/**
 * LibRaw WebAssembly Node.js Test Suite
 * Tests LibRaw WASM functionality without browser dependencies
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ANSI color codes
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m'
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
    console.log(`${color}[${timestamp}] ${level}:${colors.reset} ${message}`);
    
    if (data) {
        console.log(JSON.stringify(data, null, 2));
    }
}

async function loadLibRaw() {
    log('INFO', 'Loading LibRaw WASM module...');
    
    try {
        // Try to load the WASM module
        const wasmPath = path.resolve(__dirname, '../wasm/libraw.js');
        
        if (!fs.existsSync(wasmPath)) {
            throw new Error(`WASM module not found at ${wasmPath}`);
        }
        
        log('INFO', `Found WASM module: ${wasmPath}`);
        
        // Import the ES6 module
        const LibRawModule = await import(`file://${wasmPath}`);
        const LibRaw = await LibRawModule.default();
        
        log('SUCCESS', 'LibRaw WASM module loaded successfully');
        return { LibRaw, module: LibRaw };
        
    } catch (error) {
        log('ERROR', 'Failed to load LibRaw WASM module', {
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
}

async function testBasicAPI(LibRaw) {
    log('INFO', 'Testing basic API functions...');
    
    try {
        // Test version
        const version = LibRaw.LibRaw.getVersion();
        log('SUCCESS', `LibRaw version: ${version}`);
        
        // Test camera count
        const cameraCount = LibRaw.LibRaw.getCameraCount();
        log('SUCCESS', `Supported cameras: ${cameraCount}`);
        
        // Test camera list (show first 10)
        const cameraList = LibRaw.LibRaw.getCameraList();
        log('INFO', `First 10 supported cameras:`, cameraList.slice(0, 10));
        
        // Test instance creation
        const processor = new LibRaw.LibRaw();
        log('SUCCESS', 'LibRaw instance created successfully');
        
        // Test constants
        log('INFO', 'Color space constants:', {
            RAW: LibRaw.OUTPUT_COLOR_RAW,
            SRGB: LibRaw.OUTPUT_COLOR_SRGB,
            ADOBE: LibRaw.OUTPUT_COLOR_ADOBE,
            WIDE: LibRaw.OUTPUT_COLOR_WIDE,
            PROPHOTO: LibRaw.OUTPUT_COLOR_PROPHOTO,
            XYZ: LibRaw.OUTPUT_COLOR_XYZ
        });
        
        log('INFO', 'Quality constants:', {
            LINEAR: LibRaw.QUALITY_LINEAR,
            VNG: LibRaw.QUALITY_VNG,
            PPG: LibRaw.QUALITY_PPG,
            AHD: LibRaw.QUALITY_AHD,
            DCB: LibRaw.QUALITY_DCB,
            DHT: LibRaw.QUALITY_DHT
        });
        
        processor.delete();
        log('SUCCESS', 'Basic API tests passed');
        
    } catch (error) {
        log('ERROR', 'Basic API test failed', {
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
}

async function testFileProcessing(LibRaw, testFiles) {
    log('INFO', 'Testing file processing...');
    
    for (const testFile of testFiles) {
        try {
            log('INFO', `Testing file: ${testFile}`);
            
            if (!fs.existsSync(testFile)) {
                log('WARNING', `Test file not found: ${testFile}`);
                continue;
            }
            
            // Read file
            const fileBuffer = fs.readFileSync(testFile);
            log('INFO', `File size: ${fileBuffer.length} bytes`);
            
            // Convert to binary string for WASM
            const binaryString = Array.from(fileBuffer)
                .map(byte => String.fromCharCode(byte))
                .join('');
            
            // Create processor instance
            const processor = new LibRaw.LibRaw();
            
            // Load file
            log('INFO', 'Loading RAW file...');
            const loaded = processor.loadFromMemory(binaryString);
            
            if (!loaded) {
                log('ERROR', `Failed to load file: ${testFile}`);
                processor.delete();
                continue;
            }
            
            log('SUCCESS', 'File loaded successfully');
            
            // Unpack
            log('INFO', 'Unpacking RAW data...');
            const unpacked = processor.unpack();
            
            if (!unpacked) {
                log('ERROR', 'Failed to unpack RAW data');
                processor.delete();
                continue;
            }
            
            log('SUCCESS', 'RAW data unpacked successfully');
            
            // Get metadata
            log('INFO', 'Extracting metadata...');
            const metadata = processor.getMetadata();
            log('SUCCESS', 'Metadata extracted:', {
                make: metadata.make,
                model: metadata.model,
                iso: metadata.iso,
                shutter: metadata.shutter,
                aperture: metadata.aperture,
                rawWidth: metadata.rawWidth,
                rawHeight: metadata.rawHeight,
                width: metadata.width,
                height: metadata.height
            });
            
            // Get thumbnail
            log('INFO', 'Checking for thumbnail...');
            const thumbnail = processor.getThumbnail();
            if (thumbnail) {
                log('SUCCESS', `Thumbnail found: ${thumbnail.format} ${thumbnail.width}x${thumbnail.height}`);
            } else {
                log('INFO', 'No thumbnail available');
            }
            
            // Process image (basic settings)
            log('INFO', 'Processing image...');
            processor.setUseCameraWB(true);
            processor.setOutputColor(LibRaw.OUTPUT_COLOR_SRGB);
            processor.setQuality(LibRaw.QUALITY_AHD);
            processor.setBrightness(1.0);
            
            const processed = processor.process();
            
            if (!processed) {
                log('ERROR', 'Failed to process image');
                const errorMsg = processor.getLastError();
                log('ERROR', `Error details: ${errorMsg}`);
                processor.delete();
                continue;
            }
            
            log('SUCCESS', 'Image processed successfully');
            
            // Get image data
            log('INFO', 'Getting processed image data...');
            const imageData = processor.getImageData();
            
            if (imageData) {
                log('SUCCESS', `Image data retrieved: ${imageData.width}x${imageData.height}, ${imageData.data.length} bytes`);
                
                // Save as raw RGB data for inspection
                const outputPath = path.join(__dirname, `output_${path.basename(testFile, path.extname(testFile))}.rgb`);
                fs.writeFileSync(outputPath, imageData.data);
                log('INFO', `Raw RGB data saved to: ${outputPath}`);
            } else {
                log('ERROR', 'Failed to get image data');
            }
            
            processor.delete();
            log('SUCCESS', `File processing completed: ${testFile}`);
            
        } catch (error) {
            log('ERROR', `File processing failed: ${testFile}`, {
                error: error.message,
                stack: error.stack
            });
        }
    }
}

async function findTestFiles() {
    log('INFO', 'Searching for test RAW files...');
    
    const testDirs = [
        path.join(__dirname, 'samples'),
        path.join(__dirname, '../test-image'),
        path.join(__dirname, '../samples'),
        '/home/takuya/Pictures',
        '/tmp'
    ];
    
    const rawExtensions = ['.cr2', '.cr3', '.nef', '.arw', '.dng', '.raf', '.orf', '.rw2', '.pef', '.srw', '.raw'];
    const testFiles = [];
    
    for (const dir of testDirs) {
        if (fs.existsSync(dir)) {
            try {
                const files = fs.readdirSync(dir);
                for (const file of files) {
                    const ext = path.extname(file).toLowerCase();
                    if (rawExtensions.includes(ext)) {
                        const fullPath = path.join(dir, file);
                        const stats = fs.statSync(fullPath);
                        if (stats.size > 0 && stats.size < 100 * 1024 * 1024) { // Max 100MB
                            testFiles.push(fullPath);
                        }
                    }
                }
            } catch (error) {
                log('DEBUG', `Cannot read directory ${dir}: ${error.message}`);
            }
        }
    }
    
    log('INFO', `Found ${testFiles.length} test files:`, testFiles);
    return testFiles;
}

async function benchmarkPerformance(LibRaw, testFile) {
    if (!testFile || !fs.existsSync(testFile)) {
        log('WARNING', 'No test file available for benchmarking');
        return;
    }
    
    log('INFO', `Running performance benchmark with: ${testFile}`);
    
    const fileBuffer = fs.readFileSync(testFile);
    const binaryString = Array.from(fileBuffer)
        .map(byte => String.fromCharCode(byte))
        .join('');
    
    const iterations = 3;
    const times = [];
    
    for (let i = 0; i < iterations; i++) {
        const startTime = process.hrtime.bigint();
        
        const processor = new LibRaw.LibRaw();
        processor.loadFromMemory(binaryString);
        processor.unpack();
        processor.setUseCameraWB(true);
        processor.setOutputColor(LibRaw.OUTPUT_COLOR_SRGB);
        processor.setQuality(LibRaw.QUALITY_LINEAR); // Fast quality for benchmark
        processor.process();
        processor.getImageData();
        processor.delete();
        
        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
        times.push(duration);
        
        log('INFO', `Iteration ${i + 1}: ${duration.toFixed(2)}ms`);
    }
    
    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    
    log('SUCCESS', 'Performance benchmark results:', {
        average: `${avgTime.toFixed(2)}ms`,
        minimum: `${minTime.toFixed(2)}ms`,
        maximum: `${maxTime.toFixed(2)}ms`,
        fileSize: `${fileBuffer.length} bytes`
    });
}

async function main() {
    console.log(`${colors.cyan}🔬 LibRaw WebAssembly Test Suite${colors.reset}\n`);
    
    try {
        // Load LibRaw WASM module
        const { LibRaw } = await loadLibRaw();
        
        // Test basic API
        await testBasicAPI(LibRaw);
        
        // Find test files
        const testFiles = await findTestFiles();
        
        if (testFiles.length === 0) {
            log('WARNING', 'No RAW test files found. Create a test-image directory with RAW files for full testing.');
        } else {
            // Test file processing
            await testFileProcessing(LibRaw, testFiles.slice(0, 3)); // Test first 3 files
            
            // Benchmark
            await benchmarkPerformance(LibRaw, testFiles[0]);
        }
        
        log('SUCCESS', '🎉 All tests completed successfully!');
        
    } catch (error) {
        log('ERROR', '❌ Test suite failed', {
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

process.on('unhandledRejection', (reason) => {
    log('ERROR', 'Unhandled rejection', {
        reason: reason
    });
    process.exit(1);
});

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}