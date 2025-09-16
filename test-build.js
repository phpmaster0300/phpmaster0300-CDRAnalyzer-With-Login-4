// Simple test script to verify build works correctly
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Testing build structure...');

// Check if dist directory exists
const distPath = path.join(__dirname, 'dist');
console.log('Checking dist directory:', distPath);

if (fs.existsSync(distPath)) {
  console.log('✓ dist directory exists');
  
  // Check if index.js exists
  const indexPath = path.join(distPath, 'index.js');
  if (fs.existsSync(indexPath)) {
    console.log('✓ dist/index.js exists');
  } else {
    console.log('✗ dist/index.js NOT found');
  }
  
  // Check if public directory exists
  const publicPath = path.join(distPath, 'public');
  if (fs.existsSync(publicPath)) {
    console.log('✓ dist/public directory exists');
    
    // List some files in public directory
    const files = fs.readdirSync(publicPath);
    console.log(`Found ${files.length} files in dist/public`);
    if (files.length > 0) {
      console.log('First 5 files:', files.slice(0, 5));
    }
    
    // Check for index.html
    const indexHtmlPath = path.join(publicPath, 'index.html');
    if (fs.existsSync(indexHtmlPath)) {
      console.log('✓ dist/public/index.html exists');
    } else {
      console.log('✗ dist/public/index.html NOT found');
    }
  } else {
    console.log('✗ dist/public directory NOT found');
  }
} else {
  console.log('✗ dist directory NOT found');
}

console.log('Test completed.');