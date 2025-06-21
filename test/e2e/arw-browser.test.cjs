// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test.describe('LibRaw Sony ARW Browser Test', () => {
  let arwFileBuffer;
  let arwFileName = 'DSC00085.ARW';

  test.beforeAll(async () => {
    // Read the ARW test file
    const arwPath = path.resolve(__dirname, '../../test-image', arwFileName);
    
    if (!fs.existsSync(arwPath)) {
      throw new Error(`ARW test file not found: ${arwPath}`);
    }
    
    arwFileBuffer = fs.readFileSync(arwPath);
    console.log(`Loaded ARW test file: ${arwPath} (${(arwFileBuffer.length / 1024 / 1024).toFixed(2)} MB)`);
  });

  test.beforeEach(async ({ page }) => {
    // Enable console logging
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.error(`Browser error: ${msg.text()}`);
      } else if (msg.type() === 'warning') {
        console.warn(`Browser warning: ${msg.text()}`);
      } else {
        console.log(`Browser log: ${msg.text()}`);
      }
    });

    // Navigate to the LibRaw demo page
    await page.goto('/web/');
  });

  test('should load LibRaw WASM module', async ({ page }) => {
    // Wait for the page to load and LibRaw to initialize
    await page.waitForSelector('#status', { timeout: 30000 });
    
    // Check if LibRaw is initialized
    const status = await page.textContent('#status');
    expect(status).toContain('LibRaw');
    
    // Verify version and camera count
    const librawInfo = await page.evaluate(() => {
      return {
        hasLibRaw: typeof window.librawInstance !== 'undefined',
        version: window.librawInstance?.getVersion?.() || 'unknown',
        cameraCount: window.librawInstance?.getCameraCount?.() || 0
      };
    });
    
    expect(librawInfo.hasLibRaw).toBe(true);
    expect(librawInfo.version).toMatch(/LibRaw/);
    expect(librawInfo.cameraCount).toBeGreaterThan(1000);
    
    console.log(`LibRaw ${librawInfo.version} loaded with ${librawInfo.cameraCount} supported cameras`);
  });

  test('should process Sony ARW file', async ({ page }) => {
    // Wait for LibRaw to be ready
    await page.waitForFunction(() => window.librawInstance && window.librawInstance.ready);
    
    // Create a file input and upload the ARW file
    const fileInput = await page.locator('#fileInput');
    
    // Create a temporary file for upload
    const tempFile = path.join(__dirname, '../../temp_arw_test.arw');
    fs.writeFileSync(tempFile, arwFileBuffer);
    
    try {
      // Upload the ARW file
      await fileInput.setInputFiles(tempFile);
      
      // Wait for processing to start
      await page.waitForSelector('#processing', { state: 'visible', timeout: 10000 });
      
      // Wait for processing to complete (this may take a while)
      await page.waitForFunction(() => {
        const status = document.querySelector('#status')?.textContent || '';
        return status.includes('Completed') || status.includes('Success') || status.includes('Done') || status.includes('Finished');
      }, { timeout: 120000 }); // 2 minutes timeout for processing
      
      // Check the results
      const processingResults = await page.evaluate(() => {
        return {
          status: document.querySelector('#status')?.textContent || '',
          metadata: document.querySelector('#metadata')?.textContent || '',
          hasPreview: !!document.querySelector('#preview img'),
          previewSrc: document.querySelector('#preview img')?.src || ''
        };
      });
      
      // Verify processing was successful
      expect(processingResults.status).toMatch(/(Completed|Success|Done|Finished)/);
      expect(processingResults.metadata).toContain('Sony');
      expect(processingResults.metadata).toContain('ILCE-7RM5');
      
      console.log('Processing Status:', processingResults.status);
      console.log('Metadata contains Sony camera info:', processingResults.metadata.includes('Sony'));
      console.log('Has preview image:', processingResults.hasPreview);
      
      // Optional: Check if preview image was generated
      if (processingResults.hasPreview) {
        expect(processingResults.previewSrc).toMatch(/^data:image/);
        console.log('Preview image generated successfully');
      }
      
    } finally {
      // Clean up temporary file
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  });

  test('should extract Sony ARW metadata', async ({ page }) => {
    // Wait for LibRaw to be ready
    await page.waitForFunction(() => window.librawInstance && window.librawInstance.ready);
    
    // Inject ARW file data directly into the page
    const arwData = Array.from(arwFileBuffer);
    
    const metadata = await page.evaluate(async (arwData) => {
      try {
        // Create Uint8Array from the data
        const uint8Array = new Uint8Array(arwData);
        
        // Create ArrayBuffer
        const arrayBuffer = uint8Array.buffer.slice(uint8Array.byteOffset, uint8Array.byteOffset + uint8Array.byteLength);
        
        // Load and process with LibRaw
        const libraw = window.librawInstance;
        const image = await libraw.loadRAW(arrayBuffer);
        
        // Get metadata
        const metadata = image.getMetadata();
        
        // Cleanup
        image.dispose();
        
        return {
          success: true,
          metadata: metadata,
          error: null
        };
      } catch (error) {
        return {
          success: false,
          metadata: null,
          error: error.message
        };
      }
    }, arwData);
    
    if (!metadata.success) {
      console.error('Metadata extraction failed:', metadata.error);
      throw new Error(`Failed to extract metadata: ${metadata.error}`);
    }
    
    // Verify Sony ARW metadata
    expect(metadata.metadata.make).toBe('Sony');
    expect(metadata.metadata.model).toBe('ILCE-7RM5');
    expect(metadata.metadata.iso).toBe(100);
    expect(metadata.metadata.rawWidth).toBeGreaterThan(9000);
    expect(metadata.metadata.rawHeight).toBeGreaterThan(6000);
    
    console.log('Sony ARW Metadata extracted successfully:');
    console.log(`  Camera: ${metadata.metadata.make} ${metadata.metadata.model}`);
    console.log(`  ISO: ${metadata.metadata.iso}`);
    console.log(`  Aperture: f/${metadata.metadata.aperture}`);
    console.log(`  Shutter: ${metadata.metadata.shutter}s`);
    console.log(`  Focal Length: ${metadata.metadata.focalLength}mm`);
    console.log(`  Image Size: ${metadata.metadata.rawWidth} × ${metadata.metadata.rawHeight}`);
  });

  test('should handle processing options', async ({ page }) => {
    // Wait for LibRaw to be ready
    await page.waitForFunction(() => window.librawInstance && window.librawInstance.ready);
    
    // Test different processing options
    const processingTests = [
      {
        name: 'Camera White Balance + AHD Quality',
        options: {
          useCameraWB: true,
          useAutoWB: false,
          outputColor: 1, // sRGB
          quality: 3, // AHD
          brightness: 1.0,
          halfSize: false
        }
      },
      {
        name: 'Auto White Balance + Linear Quality (Fast)',
        options: {
          useCameraWB: false,
          useAutoWB: true,
          outputColor: 1, // sRGB
          quality: 0, // Linear
          brightness: 1.2,
          halfSize: true
        }
      }
    ];
    
    const arwData = Array.from(arwFileBuffer);
    
    for (const test of processingTests) {
      console.log(`Testing processing options: ${test.name}`);
      
      const result = await page.evaluate(async (data) => {
        const { arwData, options, testName } = data;
        
        try {
          const uint8Array = new Uint8Array(arwData);
          const arrayBuffer = uint8Array.buffer.slice(uint8Array.byteOffset, uint8Array.byteOffset + uint8Array.byteLength);
          
          const libraw = window.librawInstance;
          const image = await libraw.loadRAW(arrayBuffer);
          
          // Apply processing options
          await image.process(options);
          
          // Get image data (this might fail due to memory issues, but we test the process)
          let imageData = null;
          try {
            imageData = image.getImageData();
          } catch (error) {
            console.warn(`Image data extraction failed for ${testName}: ${error.message}`);
          }
          
          const metadata = image.getMetadata();
          image.dispose();
          
          return {
            success: true,
            testName: testName,
            hasImageData: !!imageData,
            imageSize: imageData ? `${imageData.width}×${imageData.height}` : 'unavailable',
            metadata: {
              make: metadata.make,
              model: metadata.model,
              rawSize: `${metadata.rawWidth}×${metadata.rawHeight}`
            }
          };
          
        } catch (error) {
          return {
            success: false,
            testName: testName,
            error: error.message
          };
        }
      }, { arwData, options: test.options, testName: test.name });
      
      expect(result.success).toBe(true);
      expect(result.metadata.make).toBe('Sony');
      expect(result.metadata.model).toBe('ILCE-7RM5');
      
      console.log(`  ✓ ${result.testName}: ${result.success ? 'Success' : 'Failed'}`);
      console.log(`    Image Size: ${result.imageSize}`);
      console.log(`    RAW Size: ${result.metadata.rawSize}`);
    }
  });

  test('should report performance metrics', async ({ page }) => {
    // Wait for LibRaw to be ready
    await page.waitForFunction(() => window.librawInstance && window.librawInstance.ready);
    
    const arwData = Array.from(arwFileBuffer);
    
    const performance = await page.evaluate(async (arwData) => {
      const uint8Array = new Uint8Array(arwData);
      const arrayBuffer = uint8Array.buffer.slice(uint8Array.byteOffset, uint8Array.byteOffset + uint8Array.byteLength);
      
      const startTime = performance.now();
      
      try {
        const libraw = window.librawInstance;
        
        const loadStart = performance.now();
        const image = await libraw.loadRAW(arrayBuffer);
        const loadTime = performance.now() - loadStart;
        
        const processStart = performance.now();
        await image.process({
          useCameraWB: true,
          outputColor: 1,
          quality: 0, // Linear for speed
          halfSize: true // Faster processing
        });
        const processTime = performance.now() - processStart;
        
        const metadata = image.getMetadata();
        image.dispose();
        
        const totalTime = performance.now() - startTime;
        
        return {
          success: true,
          performance: {
            loadTime: Math.round(loadTime),
            processTime: Math.round(processTime),
            totalTime: Math.round(totalTime),
            fileSize: arwData.length,
            throughput: Math.round(arwData.length / 1024 / 1024 / (totalTime / 1000) * 100) / 100
          },
          metadata: {
            make: metadata.make,
            model: metadata.model
          }
        };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    }, arwData);
    
    expect(performance.success).toBe(true);
    
    console.log('Performance Metrics:');
    console.log(`  File Size: ${(performance.performance.fileSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Load Time: ${performance.performance.loadTime}ms`);
    console.log(`  Process Time: ${performance.performance.processTime}ms`);
    console.log(`  Total Time: ${performance.performance.totalTime}ms`);
    console.log(`  Throughput: ${performance.performance.throughput} MB/s`);
    
    // Performance assertions
    expect(performance.performance.totalTime).toBeLessThan(60000); // Should complete within 1 minute
    expect(performance.performance.throughput).toBeGreaterThan(0.1); // At least 0.1 MB/s
  });
});