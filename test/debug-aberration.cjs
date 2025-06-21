#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

async function testChromatic() {
    console.log("Testing chromatic aberration specifically...");
    
    // Load LibRaw
    const LibRawFactory = require('../wasm/libraw-node.js');
    const LibRaw = await LibRawFactory();
    
    // Load test image
    const arwPath = path.resolve(__dirname, '../test-image/DSC00085.ARW');
    if (!fs.existsSync(arwPath)) {
        console.log('Test image not found');
        return;
    }
    
    const fileBuffer = fs.readFileSync(arwPath);
    const uint8Array = new Uint8Array(fileBuffer);
    
    // Create processor
    const processor = new LibRaw.LibRaw();
    processor.setDebugMode(true);
    
    try {
        // Load and unpack
        console.log("Loading file...");
        const loaded = processor.loadFromUint8Array(uint8Array);
        console.log("Load result:", loaded);
        
        const unpacked = processor.unpack();
        console.log("Unpack result:", unpacked);
        
        // Set basic parameters
        processor.setUseCameraWB(true);
        processor.setOutputColor(1);
        processor.setQuality(3);
        processor.setHalfSize(true);
        
        // Test aberration correction
        console.log("Setting aberration correction...");
        processor.setAberrationCorrection(0.999, 1.001);
        
        // Process
        console.log("Processing...");
        const processed = processor.process();
        console.log("Process result:", processed, "Type:", typeof processed);
        
    } catch (error) {
        console.error("Error:", error);
    } finally {
        processor.delete();
    }
}

testChromatic().catch(console.error);