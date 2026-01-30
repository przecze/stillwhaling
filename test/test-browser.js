#!/usr/bin/env node
/**
 * Browser test - actually loads the page and verifies data loads
 * This should catch the issue where curl works but browser fetch fails
 */

const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 9999;
const BASE_URL = `http://localhost:${PORT}`;

// Simple HTTP server that mimics Vite dev server
function createServer() {
  const distPath = path.join(__dirname, '..', 'dist');
  const publicPath = path.join(__dirname, '..', 'public');
  
  return http.createServer((req, res) => {
    const urlPath = req.url.split('?')[0];
    let filePath;
    
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };
    
    if (req.method === 'OPTIONS') {
      res.writeHead(200, corsHeaders);
      res.end();
      return;
    }
    
    if (urlPath === '/' || urlPath === '/index.html') {
      filePath = path.join(distPath, 'index.html');
    } else if (urlPath.startsWith('/data/')) {
      // Check dist first (production), then public (dev)
      filePath = path.join(distPath, urlPath);
      if (!fs.existsSync(filePath)) {
        filePath = path.join(publicPath, urlPath);
      }
    } else if (urlPath.startsWith('/assets/')) {
      filePath = path.join(distPath, urlPath);
    } else {
      res.writeHead(404, corsHeaders);
      res.end(`Not found: ${urlPath}`);
      return;
    }
    
    if (!fs.existsSync(filePath)) {
      res.writeHead(404, corsHeaders);
      res.end(`File not found: ${filePath}`);
      return;
    }
    
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(500, corsHeaders);
        res.end(`Error: ${err.message}`);
        return;
      }
      
      const ext = path.extname(filePath);
      const contentType = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json'
      }[ext] || 'text/plain';
      
      res.writeHead(200, {
        ...corsHeaders,
        'Content-Type': contentType
      });
      res.end(data);
    });
  });
}

async function runTest() {
  const server = createServer();
  let browser;
  let passed = 0;
  let failed = 0;
  const errors = [];

  return new Promise((resolve) => {
    server.listen(PORT, async () => {
      try {
        console.log('🧪 Testing browser data loading...\n');
        
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();

        // Capture all network requests
        const requests = [];
        const responses = [];
        page.on('request', req => requests.push({ url: req.url(), method: req.method() }));
        page.on('response', res => {
          responses.push({ 
            url: res.url(), 
            status: res.status(),
            headers: res.headers()
          });
        });

        // Capture console and errors
        const consoleMessages = [];
        const jsErrors = [];
        page.on('console', msg => consoleMessages.push({ type: msg.type(), text: msg.text() }));
        page.on('pageerror', error => jsErrors.push(error.message));

        console.log('1. Loading page...');
        await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
        console.log('   ✅ Page loaded');

        // Wait for JS to execute
        await page.waitForTimeout(3000);

        console.log('\n2. Checking data fetch...');
        const dataRequest = requests.find(r => r.url.includes('whaling_data.json'));
        const dataResponse = responses.find(r => r.url.includes('whaling_data.json'));
        
        if (!dataRequest) {
          console.log('   ❌ Data file was never requested!');
          failed++;
          errors.push('Data file not requested');
        } else {
          console.log(`   📡 Request made to: ${dataRequest.url}`);
          if (dataResponse) {
            if (dataResponse.status === 200) {
              console.log(`   ✅ Data response: ${dataResponse.status} OK`);
              passed++;
            } else {
              console.log(`   ❌ Data response: ${dataResponse.status}`);
              failed++;
              errors.push(`Data fetch returned ${dataResponse.status}`);
            }
          } else {
            console.log('   ❌ No response received for data request');
            failed++;
            errors.push('No response for data request');
          }
        }

        console.log('\n3. Checking for JavaScript errors...');
        const criticalErrors = jsErrors.filter(e => 
          !e.includes('world-atlas') && 
          !e.includes('cdn.jsdelivr')
        );
        
        if (criticalErrors.length > 0) {
          console.log(`   ❌ Found ${criticalErrors.length} error(s):`);
          criticalErrors.forEach(e => console.log(`      - ${e}`));
          failed++;
          errors.push(`JS errors: ${criticalErrors.join('; ')}`);
        } else {
          console.log('   ✅ No critical JavaScript errors');
          passed++;
        }

        console.log('\n4. Checking page content...');
        const content = await page.content();
        const hasError = content.includes('Failed to load data') || content.includes('Failed to load');
        
        if (hasError) {
          console.log('   ❌ Page shows error message');
          // Extract error text
          const errorMatch = content.match(/Failed to load[^<]*/);
          if (errorMatch) {
            console.log(`      Error: ${errorMatch[0]}`);
          }
          failed++;
          errors.push('Page shows error message');
        } else {
          console.log('   ✅ Page loaded without error message');
          passed++;
        }

        // Summary
        console.log('\n' + '='.repeat(50));
        console.log(`Results: ${passed} passed, ${failed} failed`);
        
        if (failed > 0) {
          console.log('\n❌ Test failed! Errors:');
          errors.forEach(e => console.log(`  - ${e}`));
          console.log('\n📋 Network requests:');
          requests.filter(r => r.url.includes('data') || r.url.includes('assets')).forEach(r => {
            const res = responses.find(res => res.url === r.url);
            console.log(`  ${r.method} ${r.url} -> ${res ? res.status : 'no response'}`);
          });
          process.exit(1);
        } else {
          console.log('\n✅ All tests passed!');
          process.exit(0);
        }

      } catch (error) {
        console.error('\n❌ Test runner error:', error.message);
        process.exit(1);
      } finally {
        if (browser) await browser.close();
        server.close();
        resolve();
      }
    });
  });
}

runTest();
