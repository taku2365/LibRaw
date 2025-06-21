// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Basic Browser Test', () => {
  test('should load demo page', async ({ page }) => {
    await page.goto('/web/');
    
    // Check if page loads
    const title = await page.title();
    expect(title).toBeTruthy();
    
    console.log(`Page title: ${title}`);
  });
  
  test('should load WASM module files', async ({ page }) => {
    // Test if WASM files are accessible
    const response = await page.goto('/wasm/libraw.js');
    expect(response.status()).toBe(200);
    
    console.log('WASM JS module accessible');
    
    // Test file listing
    const listResponse = await page.goto('/wasm/');
    expect(listResponse.status()).toBe(200);
    
    const content = await page.content();
    expect(content).toContain('libraw.js');
    expect(content).toContain('libraw-node.js');
    
    console.log('WASM directory listing working');
  });
});