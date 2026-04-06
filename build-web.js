#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const distDir = path.join(__dirname, 'dist');
const expoDir = path.join(__dirname, '.expo');

console.log('Building RetrievedNative for web...');

try {
  // Run expo export for web
  console.log('Exporting Expo app for web...');
  execSync('npx expo export --platform web', { stdio: 'inherit', cwd: __dirname });

  // Check if .expo/dist exists and move to dist
  const expoDistDir = path.join(expoDir, 'dist');
  if (fs.existsSync(expoDistDir)) {
    console.log('Moving .expo/dist to dist...');
    if (fs.existsSync(distDir)) {
      fs.rmSync(distDir, { recursive: true, force: true });
    }
    fs.renameSync(expoDistDir, distDir);
    console.log('Build complete! Output in dist/');
  } else if (fs.existsSync(distDir)) {
    console.log('Build complete! Output in dist/');
  } else {
    console.error('Could not find build output');
    process.exit(1);
  }
} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
}
