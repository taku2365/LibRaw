#!/usr/bin/env node
/**
 * LibRaw WebAssembly Debug Test
 * Detailed testing with comprehensive debug output
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
        DEBUG: colors.magenta,
        DETAIL: colors.blue
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

async function loadLibRawWithDebug() {
    log('INFO', 'Loading LibRaw WASM module with debug capabilities...');
    
    try {
        const wasmPath = path.resolve(__dirname, '../wasm/libraw.js');
        
        if (!fs.existsSync(wasmPath)) {
            throw new Error(`WASM module not found at ${wasmPath}`);
        }
        
        log('DEBUG', `Loading WASM from: ${wasmPath}`);
        
        // Import the ES6 module
        const LibRawModule = await import(`file://${wasmPath}`);
        const LibRaw = await LibRawModule.default();
        
        log('SUCCESS', 'LibRaw WASM module loaded successfully');
        
        // Test debug functionality
        const processor = new LibRaw.LibRaw();
        processor.setDebugMode(true);
        log('INFO', `Debug mode enabled: ${processor.getDebugMode()}`);
        processor.delete();
        
        return { LibRaw, module: LibRaw };
        
    } catch (error) {
        log('ERROR', 'Failed to load LibRaw WASM module', {
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
}

async function detailedFileTest(LibRaw, filePath) {
    log('INFO', `Starting detailed test of: ${path.basename(filePath)}`);
    
    const processor = new LibRaw.LibRaw();
    processor.setDebugMode(true);
    
    try {
        // File info
        const stats = fs.statSync(filePath);
        log('DETAIL', 'File information:', {
            path: filePath,
            size: `${stats.size} bytes (${(stats.size / 1024 / 1024).toFixed(2)} MB)`,
            modified: stats.mtime.toISOString()
        });
        
        // Read file
        log('INFO', 'Reading file into memory...');
        const fileBuffer = fs.readFileSync(filePath);
        const binaryString = Array.from(fileBuffer)
            .map(byte => String.fromCharCode(byte))
            .join('');
        
        log('SUCCESS', `File loaded: ${fileBuffer.length} bytes`);
        
        // Load into LibRaw (this will show debug output)
        log('INFO', '--- Loading RAW file ---');
        const startLoad = process.hrtime.bigint();
        const loaded = processor.loadFromMemory(binaryString);
        const loadTime = Number(process.hrtime.bigint() - startLoad) / 1000000;
        
        if (!loaded) {
            log('ERROR', 'Failed to load RAW file');
            return;
        }
        
        log('SUCCESS', `File loaded successfully in ${loadTime.toFixed(2)}ms`);
        
        // Get processing info
        log('INFO', '--- Processing Information ---');
        const procInfo = processor.getProcessingInfo();
        log('DETAIL', 'Detailed processing info:', procInfo);
        
        // Unpack (this will show debug output)
        log('INFO', '--- Unpacking RAW data ---');
        const startUnpack = process.hrtime.bigint();
        const unpacked = processor.unpack();
        const unpackTime = Number(process.hrtime.bigint() - startUnpack) / 1000000;
        
        if (!unpacked) {
            log('ERROR', 'Failed to unpack RAW data');
            const errorMsg = processor.getLastError();
            log('ERROR', `Error details: ${errorMsg}`);
            return;
        }
        
        log('SUCCESS', `RAW data unpacked successfully in ${unpackTime.toFixed(2)}ms`);
        
        // Get metadata
        log('INFO', '--- Extracting Metadata ---');
        const metadata = processor.getMetadata();
        log('DETAIL', 'Complete metadata:', metadata);
        
        // Test different processing settings
        const processingTests = [
            {
                name: 'Camera White Balance + Linear',
                settings: {
                    useCameraWB: true,
                    useAutoWB: false,
                    outputColor: LibRaw.OUTPUT_COLOR_SRGB,
                    quality: LibRaw.QUALITY_LINEAR,
                    brightness: 1.0,
                    halfSize: false
                }
            },
            {
                name: 'Auto White Balance + AHD',
                settings: {
                    useCameraWB: false,
                    useAutoWB: true,
                    outputColor: LibRaw.OUTPUT_COLOR_SRGB,
                    quality: LibRaw.QUALITY_AHD,
                    brightness: 1.2,
                    halfSize: false
                }
            },
            {
                name: 'Half Size + Fast Processing',
                settings: {
                    useCameraWB: true,
                    useAutoWB: false,
                    outputColor: LibRaw.OUTPUT_COLOR_SRGB,
                    quality: LibRaw.QUALITY_LINEAR,
                    brightness: 1.0,
                    halfSize: true
                }
            }
        ];
        
        for (const test of processingTests) {
            log('INFO', `--- Processing Test: ${test.name} ---`);
            
            // Apply settings
            processor.setUseCameraWB(test.settings.useCameraWB);
            processor.setUseAutoWB(test.settings.useAutoWB);
            processor.setOutputColor(test.settings.outputColor);
            processor.setQuality(test.settings.quality);
            processor.setBrightness(test.settings.brightness);
            processor.setHalfSize(test.settings.halfSize);
            
            log('DETAIL', 'Applied settings:', test.settings);
            
            // Process (this will show debug output)
            const startProcess = process.hrtime.bigint();
            const processed = processor.process();
            const processTime = Number(process.hrtime.bigint() - startProcess) / 1000000;
            
            if (!processed) {
                log('ERROR', `Processing failed for test: ${test.name}`);
                const errorMsg = processor.getLastError();
                log('ERROR', `Error details: ${errorMsg}`);
                continue;
            }
            
            log('SUCCESS', `Processing completed in ${processTime.toFixed(2)}ms`);
            
            // Get image data (this will show debug output)
            log('INFO', 'Retrieving processed image data...');
            const startImage = process.hrtime.bigint();
            const imageData = processor.getImageData();
            const imageTime = Number(process.hrtime.bigint() - startImage) / 1000000;
            
            if (imageData) {
                log('SUCCESS', `Image data retrieved in ${imageTime.toFixed(2)}ms`);
                log('DETAIL', 'Image data info:', {
                    width: imageData.width,
                    height: imageData.height,
                    colors: imageData.colors,
                    bits: imageData.bits,
                    dataSize: imageData.data.length,
                    megapixels: ((imageData.width * imageData.height) / 1000000).toFixed(2)
                });
                
                // Save sample output
                const outputPath = path.join(__dirname, `debug_${test.name.replace(/[^a-zA-Z0-9]/g, '_')}_${path.basename(filePath, path.extname(filePath))}.rgb`);
                fs.writeFileSync(outputPath, imageData.data);
                log('INFO', `RGB data saved to: ${outputPath}`);
                
                // Calculate some statistics
                const pixels = imageData.data.length / 3;
                let rSum = 0, gSum = 0, bSum = 0;
                for (let i = 0; i < imageData.data.length; i += 3) {
                    rSum += imageData.data[i];
                    gSum += imageData.data[i + 1];
                    bSum += imageData.data[i + 2];
                }
                
                log('DETAIL', 'Image statistics:', {
                    pixels: pixels,
                    averageRGB: {
                        r: (rSum / pixels).toFixed(2),
                        g: (gSum / pixels).toFixed(2),
                        b: (bSum / pixels).toFixed(2)
                    }
                });
                
            } else {
                log('ERROR', 'Failed to retrieve image data');
            }
            
            log('INFO', `Total processing time: ${(loadTime + unpackTime + processTime + imageTime).toFixed(2)}ms`);
            log('INFO', '--- End of Processing Test ---\n');
        }
        
        // Get thumbnail
        log('INFO', '--- Thumbnail Test ---');
        const thumbnail = processor.getThumbnail();
        if (thumbnail) {
            log('SUCCESS', 'Thumbnail extracted:', {
                format: thumbnail.format,
                width: thumbnail.width,
                height: thumbnail.height,
                dataSize: thumbnail.data.length
            });
            
            if (thumbnail.format === 'jpeg') {
                const thumbPath = path.join(__dirname, `thumbnail_${path.basename(filePath, path.extname(filePath))}.jpg`);
                fs.writeFileSync(thumbPath, thumbnail.data);
                log('INFO', `Thumbnail saved to: ${thumbPath}`);
            }
        } else {
            log('INFO', 'No thumbnail available in this file');
        }
        
    } catch (error) {
        log('ERROR', 'Detailed test failed', {
            error: error.message,
            stack: error.stack
        });
    } finally {
        processor.delete();
        log('INFO', 'Processor cleanup completed');
    }
}

async function memoryUsageTest(LibRaw) {
    log('INFO', '--- Memory Usage Test ---');
    
    const initialMemory = process.memoryUsage();
    log('DETAIL', 'Initial memory usage:', initialMemory);
    
    // Create and destroy many instances
    const iterations = 100;
    for (let i = 0; i < iterations; i++) {
        const processor = new LibRaw.LibRaw();
        processor.setDebugMode(false); // Reduce debug spam
        processor.delete();
        
        if (i % 25 === 0) {
            const currentMemory = process.memoryUsage();
            log('DEBUG', `Memory after ${i} iterations:`, {
                heapUsed: `${(currentMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`,
                heapTotal: `${(currentMemory.heapTotal / 1024 / 1024).toFixed(2)} MB`,
                external: `${(currentMemory.external / 1024 / 1024).toFixed(2)} MB`
            });
        }
    }
    
    // Force garbage collection if available
    if (global.gc) {
        global.gc();
        log('INFO', 'Forced garbage collection');
    }
    
    const finalMemory = process.memoryUsage();
    log('DETAIL', 'Final memory usage:', finalMemory);
    
    const memoryDiff = {
        heapUsed: finalMemory.heapUsed - initialMemory.heapUsed,
        heapTotal: finalMemory.heapTotal - initialMemory.heapTotal,
        external: finalMemory.external - initialMemory.external
    };
    
    log('SUCCESS', 'Memory usage difference:', {
        heapUsed: `${(memoryDiff.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        heapTotal: `${(memoryDiff.heapTotal / 1024 / 1024).toFixed(2)} MB`,
        external: `${(memoryDiff.external / 1024 / 1024).toFixed(2)} MB`
    });
}

async function main() {
    console.log(`${colors.cyan}${colors.bright}🔬 LibRaw WebAssembly Debug Test Suite${colors.reset}\n`);
    
    try {
        // Load LibRaw with debug
        const { LibRaw } = await loadLibRawWithDebug();
        
        // Test basic API
        log('INFO', '--- Basic API Test ---');
        const version = LibRaw.LibRaw.getVersion();
        const cameraCount = LibRaw.LibRaw.getCameraCount();
        log('SUCCESS', `LibRaw ${version} - ${cameraCount} cameras supported`);
        
        // Memory usage test
        await memoryUsageTest(LibRaw);
        
        // Find test files
        const testDirs = [
            path.join(__dirname, 'samples'),
            path.join(__dirname, '../test-image'),
            '/home/takuya/Pictures'
        ];
        
        const rawExtensions = ['.cr2', '.cr3', '.nef', '.arw', '.dng', '.raf', '.orf'];
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
                            if (stats.size > 0 && stats.size < 50 * 1024 * 1024) { // Max 50MB for debug
                                testFiles.push(fullPath);
                            }
                        }
                    }
                } catch (error) {
                    log('DEBUG', `Cannot read directory ${dir}: ${error.message}`);
                }
            }
        }
        
        if (testFiles.length === 0) {
            log('WARNING', 'No RAW test files found for detailed testing');
            log('INFO', 'To test with real files, place RAW images in test/samples/ directory');
        } else {
            log('INFO', `Found ${testFiles.length} test files`);
            
            // Test first file in detail
            await detailedFileTest(LibRaw, testFiles[0]);
        }
        
        log('SUCCESS', '🎉 Debug test suite completed successfully!');
        
    } catch (error) {
        log('ERROR', '❌ Debug test suite failed', {
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
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}