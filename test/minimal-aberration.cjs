#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

async function testMinimal() {
    console.log("Minimal chromatic aberration test...\n");
    
    // Load LibRaw
    const LibRawFactory = require('../wasm/libraw-node.js');
    const LibRaw = await LibRawFactory();
    
    // Load test image
    const arwPath = path.resolve(__dirname, '../test-image/DSC00085.ARW');
    const fileBuffer = fs.readFileSync(arwPath);
    
    // Test 1: Process without aberration correction
    console.log("Test 1: Process without aberration correction");
    {
        const processor = new LibRaw.LibRaw();
        const testData = new Uint8Array(fileBuffer);
        
        processor.loadFromUint8Array(testData);
        processor.unpack();
        processor.setHalfSize(true);
        
        const result = processor.process();
        console.log("Result:", result, "Type:", typeof result);
        processor.delete();
    }
    
    // Test 2: Process with aberration correction
    console.log("\nTest 2: Process with aberration correction");
    {
        const processor = new LibRaw.LibRaw();
        const testData = new Uint8Array(fileBuffer);
        
        processor.loadFromUint8Array(testData);
        processor.unpack();
        processor.setHalfSize(true);
        processor.setAberrationCorrection(1.0, 1.0);
        
        const result = processor.process();
        console.log("Result:", result, "Type:", typeof result);
        processor.delete();
    }
    
    // Test 3: Process with different aberration values
    console.log("\nTest 3: Process with different aberration values");
    {
        const processor = new LibRaw.LibRaw();
        const testData = new Uint8Array(fileBuffer);
        
        processor.loadFromUint8Array(testData);
        processor.unpack();
        processor.setHalfSize(true);
        processor.setAberrationCorrection(0.999, 1.001);
        
        const result = processor.process();
        console.log("Result:", result, "Type:", typeof result);
        processor.delete();
    }
}

testMinimal().catch(console.error);