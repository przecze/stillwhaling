#!/usr/bin/env node
/**
 * Simple smoke test for stillwhaling.com
 * Checks: site loads, no JS errors, data loads, key elements exist
 */

const { chromium } = require('playwright');

const BASE_URL = process.env.BASE_URL || 'http://web:80';
const TIMEOUT = 10000;

async function runTests() {
  let browser;
  let passed = 0;
  let failed = 0;
  const errors = [];

  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Capture ALL console messages (including console.log for debugging)
    const consoleMessages = [];
    page.on('console', msg => {
      const text = msg.text();
      const type = msg.type();
      // Filter out browser warnings that aren't real errors
      if (type === 'error' && text.toLowerCase().includes('cross-origin-opener-policy')) {
        // Don't add to consoleMessages, but still log it
        console.log(`   [${type.toUpperCase()}] ${text}`);
        return;
      }
      consoleMessages.push({ type, text });
      // Also log to test output for debugging
      if (type === 'log' || type === 'warn' || type === 'error') {
        console.log(`   [${type.toUpperCase()}] ${text}`);
      }
    });

    // Capture JS errors
    const jsErrors = [];
    page.on('pageerror', error => {
      // Filter out browser warnings that aren't real errors
      if (!error.message.toLowerCase().includes('cross-origin-opener-policy')) {
        jsErrors.push(error.message);
      }
    });

    console.log('🧪 Testing stillwhaling.com...\n');

    // Test 1: Site loads
    console.log('1. Testing site loads...');
    try {
      // Set extra headers to match real browser
      await page.setExtraHTTPHeaders({
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      });
      const response = await page.goto(BASE_URL, { 
        waitUntil: 'networkidle',
        timeout: TIMEOUT 
      });
      if (response.status() === 200) {
        console.log('   ✅ Site loads (200 OK)');
        passed++;
      } else {
        throw new Error(`Expected 200, got ${response.status()}`);
      }
    } catch (error) {
      console.log(`   ❌ Site load failed: ${error.message}`);
      failed++;
      errors.push(`Site load: ${error.message}`);
    }

        // Test 2: No JS errors AND page doesn't show error message
        console.log('2. Testing for JavaScript errors...');
        await page.waitForTimeout(3000); // Wait for JS to execute
        
        // Check page content for error messages
        const pageContent = await page.content();
        const hasError = pageContent.includes('Failed to load data') || 
                        pageContent.includes('Failed to load');
        
        // Filter out known non-critical errors
        const criticalErrors = jsErrors.filter(e => {
          const lower = e.toLowerCase();
          return !lower.includes('world-atlas') && 
                 !lower.includes('cdn.jsdelivr') &&
                 !lower.includes('cross-origin-opener-policy'); // Browser warning about HTTP, not a real error
        });
        const criticalConsoleErrors = consoleMessages
          .filter(m => m.type === 'error')
          .map(m => m.text)
          .filter(e => {
            const lower = e.toLowerCase();
            return !lower.includes('world-atlas') && 
                   !lower.includes('cdn.jsdelivr') &&
                   !lower.includes('failed to load resource') && // Network errors are separate
                   !lower.includes('cross-origin-opener-policy'); // Browser warning about HTTP, not a real error
          });
        
        
        if (hasError) {
          console.log('   ❌ Page shows error message');
          // Try to extract the actual error
          const errorText = await page.evaluate(() => {
            const errorDiv = document.querySelector('.loading');
            return errorDiv ? errorDiv.textContent : 'Unknown error';
          }).catch(() => 'Could not extract error');
          console.log(`      Error: ${errorText.substring(0, 200)}`);
          failed++;
          errors.push(`Page error: ${errorText.substring(0, 100)}`);
        } else if (criticalErrors.length > 0 || criticalConsoleErrors.length > 0) {
          console.log(`   ❌ Found ${criticalErrors.length + criticalConsoleErrors.length} error(s)`);
          criticalErrors.forEach(e => console.log(`      - ${e}`));
          criticalConsoleErrors.forEach(e => console.log(`      - ${e}`));
          failed++;
          errors.push(`JS errors: ${criticalErrors.join('; ')} ${criticalConsoleErrors.join('; ')}`);
        } else {
          console.log('   ✅ No JavaScript errors');
          passed++;
        }
        

        // Test 3: Data loads successfully
        console.log('3. Testing data loads...');
        try {
          // Check console logs first - data might have already loaded before we start waiting
          // Look for the exact log message format: "✅ Data loaded: {years: X, countries: Y, records: Z}"
          const dataLogFound = consoleMessages.some(m => 
            m.type === 'log' && 
            (m.text.includes('✅ Data loaded') || m.text.includes('Data loaded:')) &&
            (m.text.includes('years') || m.text.includes('records'))
          );
          
          if (dataLogFound) {
            // Data already loaded, just verify page state
            await page.waitForTimeout(1000); // Give time for rendering
            const dataCheck = await page.evaluate(() => {
              const statTotal = document.querySelector('#stat-total');
              const statLabel = document.querySelector('#stat-label');
              return statTotal && statLabel && statTotal.textContent !== '0' && statTotal.textContent !== '';
            });
            
            if (dataCheck) {
              // Extract data from console log
              const dataLog = consoleMessages.find(m => 
                m.type === 'log' && m.text.includes('Data loaded') && m.text.includes('years')
              );
              console.log(`   ✅ Data loaded successfully (verified via console log and page state)`);
              if (dataLog) {
                console.log(`      ${dataLog.text}`);
              }
              passed++;
            } else {
              throw new Error('Console says data loaded but page state shows no data');
            }
          } else {
            // Wait for the network request (data hasn't loaded yet)
            const dataResponse = await page.waitForResponse(
              response => response.url().includes('/data/whaling_data.json'),
              { timeout: TIMEOUT }
            );
            
            if (!dataResponse.ok()) {
              throw new Error(`Data request failed: ${dataResponse.status()} ${dataResponse.statusText()}`);
            }
            
            // Verify response is actually JSON
            const responseText = await dataResponse.text();
            let data;
            try {
              data = JSON.parse(responseText);
            } catch (parseError) {
              console.log(`   ❌ Response is not valid JSON`);
              console.log(`      First 200 chars: ${responseText.substring(0, 200)}`);
              throw new Error(`JSON parse failed: ${parseError.message}`);
            }
            
            if (!data.metadata || !data.timeline || !data.byCountryYear) {
              throw new Error('Data structure invalid - missing required fields');
            }
            
            console.log(`   ✅ Data loaded successfully (${data.timeline.length} years, ${data.byCountryYear.length} records)`);
            passed++;
          }
        } catch (error) {
          console.log(`   ❌ Data load failed: ${error.message}`);
          failed++;
          errors.push(`Data load: ${error.message}`);
        }

        // Test 4: Key elements exist (only if no error)
        console.log('4. Testing key elements exist...');
        try {
          // If there's an error message, elements won't exist
          const pageContent = await page.content();
          if (pageContent.includes('Failed to load data')) {
            console.log('   ⚠️  Skipping element check (page shows error)');
            // Don't fail here - error already caught in test 2
          } else {
            await page.waitForSelector('h1', { timeout: 5000 });
            await page.waitForSelector('.map-container', { timeout: 5000 });
            await page.waitForSelector('.timeline-container', { timeout: 5000 });
            await page.waitForSelector('.filter-btn', { timeout: 5000 });
            
            const title = await page.textContent('h1');
            const hasMap = await page.$('.map-container') !== null;
            const hasTimeline = await page.$('.timeline-container') !== null;
            const filterCount = await page.$$('.filter-btn').then(els => els.length);

            if (title && title.includes('Whaling') && hasMap && hasTimeline && filterCount > 0) {
              console.log(`   ✅ Key elements found (title, map, timeline, ${filterCount} filters)`);
              passed++;
            } else {
              throw new Error('Missing key elements');
            }
          }
        } catch (error) {
          console.log(`   ❌ Elements check failed: ${error.message}`);
          failed++;
          errors.push(`Elements: ${error.message}`);
        }

    // Test 5: World map loads (non-critical - external CDN)
    console.log('5. Testing world map loads...');
    try {
      const mapResponse = await page.waitForResponse(
        response => response.url().includes('world-atlas') || response.url().includes('unpkg'),
        { timeout: TIMEOUT }
      );
      if (mapResponse.ok()) {
        console.log('   ✅ World map data loaded');
        passed++;
      } else {
        console.log(`   ⚠️  Map request failed: ${mapResponse.status()} (external CDN, may be temporary)`);
        // Don't fail the test - this is external
      }
    } catch (error) {
      console.log(`   ⚠️  Map load failed: ${error.message} (external CDN, non-critical)`);
      // Don't fail the test - external resource
    }

    // Test 6: Map coloring works
    console.log('6. Testing map coloring...');
    try {
      await page.waitForTimeout(2000); // Wait for map to render and color
      
      // Check if map paths exist and have colors
      const mapInfo = await page.evaluate(() => {
        const paths = document.querySelectorAll('.map-container path.country');
        const defaultColor = 'rgb(19, 36, 51)'; // #132433 in rgb
        const coloredPaths = Array.from(paths).filter(p => {
          // Check computed style, not just attribute (CSS might override)
          const computedFill = window.getComputedStyle(p).fill;
          const attrFill = p.getAttribute('fill');
          const styleFill = p.style.fill;
          // Use style if set, otherwise computed, otherwise attribute
          const actualFill = styleFill || computedFill || attrFill;
          return actualFill && actualFill !== '#132433' && actualFill !== defaultColor && !actualFill.includes('rgb(19, 36, 51)');
        });
        
        // Get sample of colored countries with all fill sources
        const sampleColored = Array.from(paths)
          .filter(p => {
            const computedFill = window.getComputedStyle(p).fill;
            const attrFill = p.getAttribute('fill');
            const styleFill = p.style.fill;
            const actualFill = styleFill || computedFill || attrFill;
            return actualFill && actualFill !== '#132433' && actualFill !== defaultColor && !actualFill.includes('rgb(19, 36, 51)');
          })
          .slice(0, 5)
          .map(p => ({
            fill: p.style.fill || window.getComputedStyle(p).fill || p.getAttribute('fill'),
            hasWhalingClass: p.classList.contains('whaling'),
            attrFill: p.getAttribute('fill'),
            styleFill: p.style.fill,
            computedFill: window.getComputedStyle(p).fill
          }));
        
        return {
          totalPaths: paths.length,
          coloredPaths: coloredPaths.length,
          sampleColored
        };
      });
      
      if (mapInfo.totalPaths === 0) {
        console.log('   ⚠️  No map paths found (map may not have loaded)');
      } else if (mapInfo.coloredPaths === 0) {
        console.log(`   ❌ Map has ${mapInfo.totalPaths} paths but none are colored`);
        console.log('      This indicates the coloring logic is not working');
        failed++;
        errors.push('Map coloring: No paths colored');
      } else {
        console.log(`   ✅ Map coloring works: ${mapInfo.coloredPaths}/${mapInfo.totalPaths} paths colored`);
        console.log(`      Sample colors: ${mapInfo.sampleColored.map(s => s.fill).join(', ')}`);
        passed++;
      }
    } catch (error) {
      console.log(`   ⚠️  Map coloring check failed: ${error.message}`);
      // Don't fail - this is a feature check
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log(`Results: ${passed} passed, ${failed} failed`);
    
    if (failed > 0) {
      console.log('\nErrors:');
      errors.forEach(e => console.log(`  - ${e}`));
      process.exit(1);
    } else {
      console.log('\n✅ All tests passed!');
      process.exit(0);
    }

  } catch (error) {
    console.error('\n❌ Test runner error:', error.message);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

runTests();
