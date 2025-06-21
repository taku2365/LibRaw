#!/usr/bin/env node
/**
 * LibRaw Sony ARW Basic Test - Focus on core functionality
 * Tests successful ARW loading, metadata extraction, and basic processing
 */

const fs = require('fs');
const path = require('path');

function log(level, message) {
    const colors = {
        INFO: '\x1b[36m\x1b[1m',
        ERROR: '\x1b[31m\x1b[1m',
        SUCCESS: '\x1b[32m\x1b[1m',
        DETAIL: '\x1b[34m\x1b[1m',
        RESET: '\x1b[0m'
    };
    console.log(`${colors[level] || ''}[${level}]${colors.RESET} ${message}`);
}

async function testBasicARWProcessing() {
    try {
        // Load LibRaw
        log('INFO', 'Loading LibRaw WASM module...');
        const wasmPath = path.resolve(__dirname, '../wasm/libraw-node.js');
        const LibRawFactory = require(wasmPath);
        const LibRaw = await LibRawFactory();
        
        log('SUCCESS', `LibRaw ${LibRaw.LibRaw.getVersion()} loaded`);
        
        // Load ARW file
        const arwPath = path.resolve(__dirname, '../test-image/DSC00085.ARW');
        if (!fs.existsSync(arwPath)) {
            log('ERROR', 'ARW file not found');
            return false;
        }
        
        const processor = new LibRaw.LibRaw();
        processor.setDebugMode(false); // Reduce debug output
        
        // Read and convert file
        log('INFO', 'Loading Sony ARW file...');
        const fileBuffer = fs.readFileSync(arwPath);
        const uint8Array = new Uint8Array(fileBuffer);
        
        const loaded = processor.loadFromUint8Array(uint8Array);
        if (!loaded) {
            log('ERROR', 'Failed to load ARW file');
            return false;
        }
        
        log('SUCCESS', 'Sony ARW file loaded successfully');
        
        // Extract metadata
        const metadata = processor.getMetadata();
        log('SUCCESS', `Camera: ${metadata.make} ${metadata.model}`);
        log('SUCCESS', `Settings: ISO ${metadata.iso}, f/${metadata.aperture}, ${metadata.shutter}s, ${metadata.focalLength}mm`);
        log('SUCCESS', `Image size: ${metadata.rawWidth} × ${metadata.rawHeight} RAW, ${metadata.width} × ${metadata.height} output`);
        log('SUCCESS', `Timestamp: ${new Date(metadata.timestamp * 1000).toLocaleString('ja-JP')}`);
        
        // Unpack RAW data
        log('INFO', 'Unpacking RAW data...');
        const unpacked = processor.unpack();
        if (!unpacked) {
            log('ERROR', 'Failed to unpack RAW data');
            return false;
        }
        
        log('SUCCESS', 'RAW data unpacked successfully');
        
        // Basic processing test
        log('INFO', 'Testing basic image processing...');
        processor.setUseCameraWB(true);
        processor.setOutputColor(LibRaw.OUTPUT_COLOR_SRGB);
        processor.setQuality(LibRaw.QUALITY_LINEAR); // Fast processing
        processor.setHalfSize(true); // Reduce processing time
        
        const processed = processor.process();
        if (!processed) {
            log('ERROR', 'Image processing failed');
            return false;
        }
        
        log('SUCCESS', 'Basic image processing completed');
        
        // Get processed image data
        const imageData = processor.getImageData();
        if (!imageData) {
            log('ERROR', 'Failed to get processed image data');
            return false;
        }
        
        log('SUCCESS', `Processed image: ${imageData.width} × ${imageData.height}, ${(imageData.data.length / 1024 / 1024).toFixed(2)} MB`);
        
        // Save a small RGB sample
        const rgbPath = path.join(__dirname, 'arw_basic_test_output.rgb');
        const rgbBuffer = Buffer.from(imageData.data);
        fs.writeFileSync(rgbPath, rgbBuffer);
        log('SUCCESS', `RGB data saved: ${rgbPath}`);
        
        // Create PPM for easy viewing
        const ppmPath = path.join(__dirname, 'arw_basic_test_output.ppm');
        const ppmHeader = `P6\n${imageData.width} ${imageData.height}\n255\n`;
        const ppmData = Buffer.concat([Buffer.from(ppmHeader, 'ascii'), rgbBuffer]);
        fs.writeFileSync(ppmPath, ppmData);
        log('SUCCESS', `PPM image saved: ${ppmPath}`);
        
        processor.delete();
        return true;
        
    } catch (error) {
        log('ERROR', `Test failed: ${error.message}`);
        return false;
    }
}

async function main() {
    console.log('\x1b[36m\x1b[1m📸 LibRaw Sony ARW Basic Test\x1b[0m\n');
    
    const success = await testBasicARWProcessing();
    
    if (success) {
        console.log('\n\x1b[32m\x1b[1m🎉 Sony ARW basic test completed successfully!\x1b[0m');
        console.log('\nResults:');
        console.log('✅ Sony ARW file loaded and recognized');
        console.log('✅ Metadata extracted (camera, settings, dimensions)');
        console.log('✅ RAW data unpacked');
        console.log('✅ Basic image processing completed');
        console.log('✅ RGB image data generated');
        console.log('\nGenerated files:');
        console.log('- arw_basic_test_output.rgb (raw RGB data)');
        console.log('- arw_basic_test_output.ppm (viewable image)');
    } else {
        console.log('\n\x1b[31m\x1b[1m❌ Sony ARW basic test failed\x1b[0m');
        process.exit(1);
    }
}

main().catch(console.error);