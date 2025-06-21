#!/usr/bin/env node
/**
 * Simple HTTP server for LibRaw WebAssembly demo
 * Provides proper headers for WASM files and supports CORS
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 8000;
const HOST = process.env.HOST || 'localhost';

// MIME types for different file extensions
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.arw': 'application/octet-stream',
  '.cr2': 'application/octet-stream',
  '.nef': 'application/octet-stream',
  '.dng': 'application/octet-stream',
  '.raf': 'application/octet-stream',
  '.orf': 'application/octet-stream'
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return mimeTypes[ext] || 'application/octet-stream';
}

function sendFile(res, filePath, statusCode = 200) {
  const mimeType = getMimeType(filePath);
  const stat = fs.statSync(filePath);
  
  // Set headers
  res.writeHead(statusCode, {
    'Content-Type': mimeType,
    'Content-Length': stat.size,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Opener-Policy': 'same-origin',
    // Cache control for WASM files
    'Cache-Control': mimeType === 'application/wasm' ? 'max-age=86400' : 'no-cache'
  });
  
  // Stream file to response
  const readStream = fs.createReadStream(filePath);
  readStream.pipe(res);
}

function sendError(res, statusCode, message) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(message);
}

function sendDirectoryListing(res, dirPath, urlPath) {
  try {
    const files = fs.readdirSync(dirPath);
    
    let html = `<!DOCTYPE html>
<html>
<head>
    <title>Directory: ${urlPath}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .file { margin: 5px 0; }
        .dir { color: #0066cc; font-weight: bold; }
        .file-link { text-decoration: none; }
        .file-link:hover { text-decoration: underline; }
        .size { color: #666; margin-left: 10px; }
    </style>
</head>
<body>
    <h1>Directory: ${urlPath}</h1>
    <div class="file">
        <a href="../" class="file-link dir">../</a>
    </div>`;
    
    files.forEach(file => {
      const filePath = path.join(dirPath, file);
      const stat = fs.statSync(filePath);
      const isDir = stat.isDirectory();
      const href = path.posix.join(urlPath, file) + (isDir ? '/' : '');
      const size = isDir ? '' : ` <span class="size">(${(stat.size / 1024).toFixed(1)} KB)</span>`;
      const className = isDir ? 'dir' : 'file';
      
      html += `    <div class="file">
        <a href="${href}" class="file-link ${className}">${file}${isDir ? '/' : ''}</a>${size}
    </div>`;
    });
    
    html += `</body></html>`;
    
    res.writeHead(200, {
      'Content-Type': 'text/html',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(html);
  } catch (error) {
    sendError(res, 500, 'Error reading directory');
  }
}

const server = http.createServer((req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end();
    return;
  }
  
  const urlObj = url.parse(req.url, true);
  let filePath = path.join(__dirname, urlObj.pathname);
  
  // Security: prevent directory traversal
  if (!filePath.startsWith(__dirname)) {
    sendError(res, 403, 'Forbidden');
    return;
  }
  
  try {
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      // Try to serve index.html from directory
      const indexPath = path.join(filePath, 'index.html');
      if (fs.existsSync(indexPath)) {
        sendFile(res, indexPath);
      } else {
        // Show directory listing
        sendDirectoryListing(res, filePath, urlObj.pathname);
      }
    } else {
      // Serve file
      sendFile(res, filePath);
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      sendError(res, 404, 'File not found');
    } else {
      console.error('Server error:', error);
      sendError(res, 500, 'Internal server error');
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`LibRaw WebAssembly Server running at http://${HOST}:${PORT}/`);
  console.log('');
  console.log('Available endpoints:');
  console.log(`  📄 Demo: http://${HOST}:${PORT}/web/`);
  console.log(`  📦 WASM: http://${HOST}:${PORT}/wasm/`);
  console.log(`  🧪 Test Image: http://${HOST}:${PORT}/test-image/`);
  console.log('');
  console.log('Press Ctrl+C to stop the server');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  server.close(() => {
    console.log('Server stopped');
    process.exit(0);
  });
});