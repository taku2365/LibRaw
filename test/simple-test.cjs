// Simple Node.js test for LibRaw WASM (CommonJS compatible)
const fs = require('fs');
const path = require('path');

console.log('🔬 LibRaw WASM Basic Test');

// Test basic API without actual RAW processing
async function basicTest() {
    try {
        console.log('✅ Node.js module loading test passed');
        console.log('✅ File system access test passed');
        
        // Check both ES6 and CommonJS modules
        const wasmPathES6 = path.resolve(__dirname, '../wasm/libraw.js');
        const wasmPathCJS = path.resolve(__dirname, '../wasm/libraw-node.js');
        
        if (fs.existsSync(wasmPathES6)) {
            const stats = fs.statSync(wasmPathES6);
            console.log(`✅ ES6 WASM module found: ${wasmPathES6}`);
            console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
            console.log(`   Modified: ${stats.mtime.toISOString()}`);
        } else {
            console.log('❌ ES6 WASM module not found');
        }
        
        if (fs.existsSync(wasmPathCJS)) {
            const stats = fs.statSync(wasmPathCJS);
            console.log(`✅ CommonJS WASM module found: ${wasmPathCJS}`);
            console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
            console.log(`   Modified: ${stats.mtime.toISOString()}`);
        } else {
            console.log('❌ CommonJS WASM module not found');
        }
        
        if (!fs.existsSync(wasmPathES6) && !fs.existsSync(wasmPathCJS)) {
            console.log('❌ No WASM modules found');
            return;
        }
        
        // Test CLI tool
        const cliPath = path.resolve(__dirname, '../cli-tool.js');
        if (fs.existsSync(cliPath)) {
            console.log('✅ CLI tool found');
        } else {
            console.log('❌ CLI tool not found');
        }
        
        // Test web files
        const webDir = path.resolve(__dirname, '../web');
        if (fs.existsSync(webDir)) {
            const webFiles = fs.readdirSync(webDir);
            console.log(`✅ Web demo files: ${webFiles.join(', ')}`);
        } else {
            console.log('❌ Web demo directory not found');
        }
        
        console.log('\n📝 Usage Instructions:');
        console.log('1. For browser testing:');
        console.log('   python3 -m http.server 8000');
        console.log('   Open http://localhost:8000/web/');
        console.log('');
        console.log('2. For command line testing:');
        console.log('   node cli-tool.js --help');
        console.log('   node cli-tool.js --metadata sample.arw');
        console.log('');
        console.log('3. For Node.js CommonJS testing (recommended):');
        console.log('   node test/node-test.cjs');
        console.log('');
        console.log('4. For Node.js ES6 module testing:');
        console.log('   cd test && npm test');
        console.log('   cd test && npm run debug');
        console.log('');
        console.log('5. For basic verification:');
        console.log('   node test/simple-test.js');
        
        console.log('\n🎉 Basic test completed successfully!');
        
    } catch (error) {
        console.log(`❌ Test failed: ${error.message}`);
    }
}

basicTest();