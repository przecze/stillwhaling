import './style.css';
import * as d3 from 'd3';
import { feature } from 'topojson-client';
import { WhalingData, CountryYearEntry } from './types';

// Map numeric country IDs to ISO_A3 codes (world-atlas uses numeric IDs)
// This is a partial mapping for whaling countries - we'll add more as needed
const NUMERIC_TO_ISO: Record<string, string> = {
  '392': 'JPN', // Japan
  '643': 'RUS', // Russia
  '360': 'IDN', // Indonesia
  '208': 'DNK', // Denmark
  '304': 'GRL', // Greenland
  '352': 'ISL', // Iceland
  '578': 'NOR', // Norway
  '670': 'VCT', // Saint Vincent & the Grenadines
  '410': 'KOR', // Korea
  '840': 'USA', // United States
  '620': 'PRT', // Portugal
  '124': 'CAN', // Canada
};

// Map related countries (e.g., Greenland inherits Denmark's catches)
const RELATED_COUNTRY_MAP: Record<string, string> = {
  'GRL': 'DNK', // Greenland uses Denmark's data
};

// State
let data: WhalingData;
let worldTopo: any;
let currentYear: number;
let selectedSpecies: string[] = []; // Empty = all species
let hoveredCountry: string | null = null;

// Helper: Extract country code from map feature
function getCountryCode(d: any): string {
  let code = d.properties?.ISO_A3 || d.properties?.iso_a3 || d.id;
  // Convert numeric ID to ISO_A3 if needed
  if (code && /^\d+$/.test(String(code))) {
    code = NUMERIC_TO_ISO[String(code)] || code;
  }
  return code || '';
}

// Helper: Validate year is in valid range
function isValidYear(year: number): boolean {
  if (!data?.metadata?.years) return false;
  return year >= data.metadata.years[0] && year <= data.metadata.years[data.metadata.years.length - 1];
}

// Helper: Clamp year to valid range
function clampYear(year: number): number {
  if (!data?.metadata?.years) return year;
  const min = data.metadata.years[0];
  const max = data.metadata.years[data.metadata.years.length - 1];
  return Math.max(min, Math.min(max, year));
}

// Helper: Create empty topo object to prevent crashes
function createEmptyTopo() {
  return { objects: { countries: { type: 'GeometryCollection', geometries: [] } } };
}

// Load data and world map
async function init() {
  const app = document.getElementById('app');
  if (!app) {
    console.error('App element not found');
    return;
  }

  try {
    // Load whaling data
    console.log('Loading whaling data from /data/whaling_data.json...');
    const dataResponse = await fetch('/data/whaling_data.json', {
      cache: 'no-cache',
      headers: {
        'Cache-Control': 'no-cache'
      }
    });
    
    if (!dataResponse.ok) {
      const errorText = await dataResponse.text();
      throw new Error(`HTTP ${dataResponse.status}: ${dataResponse.statusText}\n${errorText.substring(0, 200)}`);
    }
    
    const dataText = await dataResponse.text();
    try {
      data = JSON.parse(dataText);
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      console.error('Response text (first 500 chars):', dataText.substring(0, 500));
      throw new Error(`Failed to parse JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
    }
    
    if (!data.metadata || !data.timeline || !data.byCountryYear) {
      throw new Error('Invalid data structure: missing metadata, timeline, or byCountryYear');
    }
    
    console.log('✅ Data loaded:', {
      years: data.metadata.years.length,
      countries: data.metadata.countries.length,
      records: data.byCountryYear.length
    });
    
    // Set initial year to most recent (validated)
    currentYear = clampYear(data.metadata.years[data.metadata.years.length - 1]);
    
    // Load world map (TopoJSON) - non-blocking, app works without it
    console.log('Loading world map...');
    try {
      // Try multiple sources
      const mapUrl = 'https://unpkg.com/world-atlas@1.1.4/world/110m.json';
      try {
        const response = await fetch(mapUrl, { signal: AbortSignal.timeout(5000) });
        if (response.ok) {
          worldTopo = await response.json();
          console.log(`✅ World map loaded from ${mapUrl}`);
        } else {
          console.warn(`⚠️  World map request failed (${response.status})`);
          worldTopo = createEmptyTopo();
        }
      } catch (err) {
        console.warn('⚠️  Could not load world map', err);
        worldTopo = createEmptyTopo();
      }
    } catch (error) {
      console.error('World map load error:', error);
      worldTopo = createEmptyTopo();
    }
    
    render();
  } catch (error) {
    console.error('Failed to load data:', error);
    app.innerHTML = `
    <div class="loading error-panel">
        <h2>Failed to load data</h2>
      <p class="error-message">
          ${error instanceof Error ? error.message : String(error)}
        </p>
      <p class="error-hint">
          Check the browser console for details. Make sure:<br/>
          • Dev server is running on port 3000<br/>
          • Data file exists at public/data/whaling_data.json<br/>
        • Run: <code class="command-note">uv run python data/process_data.py</code>
        </p>
      </div>
    `;
  }
}

function render() {
  const app = d3.select('#app');
  app.html(''); // Clear loading
  
  // Create header
  app.append('header')
    .html(`
      <div>
        <h1>Still <span>Whaling</span></h1>
        <div class="subtitle">Who's still hunting whales?</div>
      </div>
      <button class="about-btn" id="about-btn">About</button>
    `);
  
  // About dialog
  const aboutDialog = app.append('div').attr('class', 'about-dialog').attr('id', 'about-dialog');
  aboutDialog.html(`
    <div class="about-dialog-content">
      <button class="about-close" id="about-close">×</button>
      <h2>About</h2>
      <p>Interactive visualization of global whaling data showing which countries are still hunting whales.</p>
      <div class="about-links">
        <div class="about-link-section">
          <h3>Data Source</h3>
          <a href="https://iwc.int/management-and-conservation/whaling/total-catches" target="_blank" rel="noopener noreferrer">
            IWC Total Catches Database
          </a>
        </div>
        <div class="about-link-section">
          <h3>Inspiration</h3>
          <a href="https://youtu.be/rTgwZR3T_uo" target="_blank" rel="noopener noreferrer" class="inspiration-link">
            <div class="video-title">Whale Hunting Was Absolutely Crazy</div>
            <div class="video-meta">by Nightshift – Kurzgesagt After Dark (Jan 30, 2026)</div>
          </a>
        </div>
        <div class="about-link-section">
          <h3>Author</h3>
          <div class="about-author">Jan Czechowski 2026</div>
          <a href="https://janczechowski.com" target="_blank" rel="noopener noreferrer">
            janczechowski.com
          </a>
        </div>
      </div>
    </div>
  `);
  
  // About dialog handlers
  d3.select('#about-btn').on('click', () => {
    d3.select('#about-dialog').classed('visible', true);
  });
  
  d3.select('#about-close').on('click', () => {
    d3.select('#about-dialog').classed('visible', false);
  });
  
  // Close on backdrop click
  aboutDialog.on('click', function(event: MouseEvent) {
    if ((event.target as HTMLElement).classList.contains('about-dialog')) {
      d3.select('#about-dialog').classed('visible', false);
    }
  });
  
  // Species filters
  const filtersDiv = app.append('div').attr('class', 'filters');
  const speciesEntries = Object.entries(data.metadata.species);
  
  speciesEntries.forEach(([code, name]) => {
    filtersDiv.append('button')
      .attr('class', 'filter-btn')
      .text(name)
      .on('click', function(this: HTMLButtonElement) {
        const btn = d3.select(this);
        const isActive = btn.classed('active');
        
        if (isActive) {
          btn.classed('active', false);
          selectedSpecies = selectedSpecies.filter(s => s !== code);
        } else {
          btn.classed('active', true);
          selectedSpecies.push(code);
        }
        
        updateVisualization();
      });
  });
  
  // Add "All" button
  filtersDiv.insert('button', ':first-child')
    .attr('class', 'filter-btn active')
    .text('All Species')
    .on('click', function(this: HTMLButtonElement) {
      d3.selectAll('.filter-btn').classed('active', false);
      d3.select(this).classed('active', true);
      selectedSpecies = [];
      updateVisualization();
    });
  
  // Timeline
  createTimeline(app as any);
  
  // Tooltip
  app.append('div').attr('class', 'tooltip');
  
  // Map (will call updateVisualization when ready)
  createMap(app as any);

  // Add footer
  app.append('footer')
    .html(`
      <div class="footer-content">
        <span>© 2026 <a href="https://janczechowski.com" target="_blank" rel="noopener noreferrer">Jan Czechowski</a></span>
        <span class="footer-divider">|</span>
        <span>Data: <a href="https://iwc.int/management-and-conservation/whaling/total-catches" target="_blank" rel="noopener noreferrer">International Whaling Commision</a></span>
      </div>
    `);
  
  // Initial visualization will be triggered by createMap when paths are ready
  // No setTimeout hack needed - createMap calls updateVisualization directly
}

function createTimeline(container: d3.Selection<any, unknown, null, undefined>) {
  const timelineDiv = container.append('div').attr('class', 'timeline-container');
  
  const header = timelineDiv.append('div').attr('class', 'timeline-header');
  header.append('div').attr('class', 'timeline-title').text('Global Whale Catches');
  header.append('div').attr('class', 'timeline-year').attr('id', 'timeline-year');
  
  const svg = timelineDiv.append('svg')
    .attr('class', 'timeline-svg')
    .attr('viewBox', '0 0 1000 80');
  
  const margin = { top: 10, right: 40, bottom: 20, left: 40 };
  const width = 1000 - margin.left - margin.right;
  const height = 80 - margin.top - margin.bottom;
  
  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);
  
  // Scales
  const xScale = d3.scaleLinear()
    .domain(d3.extent(data.metadata.years) as [number, number])
    .range([0, width]);
  
  const maxTotal = d3.max(data.timeline, d => d.total) || 0;
  const yScale = d3.scaleLinear()
    .domain([0, maxTotal])
    .range([height, 0]);
  
  // Line generator
  const line = d3.line<{year: number; total: number}>()
    .x((d: {year: number; total: number}) => xScale(d.year))
    .y((d: {year: number; total: number}) => yScale(d.total))
    .curve(d3.curveMonotoneX);
  
  // Area generator (used for both main timeline and country highlight)
  const area = d3.area<{year: number; total: number}>()
    .x((d: {year: number; total: number}) => xScale(d.year))
    .y0(height)
    .y1((d: {year: number; total: number}) => yScale(d.total))
    .curve(d3.curveMonotoneX);
  
  // Draw area
  g.append('path')
    .datum(data.timeline)
    .attr('class', 'timeline-area')
    .attr('d', area);
  
  // Draw line
  g.append('path')
    .datum(data.timeline)
    .attr('class', 'timeline-line')
    .attr('d', line);
  
  // Country highlight area (hidden by default)
  g.append('path')
    .attr('class', 'timeline-country-area')
    .attr('id', 'timeline-country-area');
  
  // Scrubber line
  const scrubber = g.append('g').attr('class', 'timeline-scrubber-group');
  scrubber.append('line')
    .attr('class', 'timeline-scrubber')
    .attr('x1', xScale(currentYear))
    .attr('x2', xScale(currentYear))
    .attr('y1', 0)
    .attr('y2', height);
  
  scrubber.append('circle')
    .attr('class', 'timeline-scrubber-head')
    .attr('cx', xScale(currentYear))
    .attr('cy', height)
    .attr('r', 6);
  
  // X axis
  const xAxis = d3.axisBottom(xScale)
    .ticks(10)
    .tickFormat((d) => String(d));
  
  g.append('g')
    .attr('class', 'timeline-axis')
    .attr('transform', `translate(0,${height})`)
    .call(xAxis);
  
  // Helper: Update year from x position
  function updateYearFromX(x: number, isRelative: boolean = false) {
    const adjustedX = isRelative ? Math.max(0, Math.min(width, x)) : x - margin.left;
    if (adjustedX >= 0 && adjustedX <= width) {
      const year = Math.round(xScale.invert(adjustedX));
      if (isValidYear(year)) {
        currentYear = year;
        updateScrubber();
        updateVisualization();
      }
    }
  }
  
  // Interaction - drag anywhere on timeline
  const timelineDrag = d3.drag<SVGSVGElement, unknown>()
    .on('drag', function(this: SVGSVGElement, event: d3.D3DragEvent<SVGSVGElement, unknown, unknown>) {
      const [x] = d3.pointer(event, this);
      updateYearFromX(x, false);
    });
  
  svg.call(timelineDrag);
  
  // Also allow dragging the scrubber directly
  const scrubberDrag = d3.drag<SVGGElement, unknown>()
    .on('drag', function(event: d3.D3DragEvent<SVGGElement, unknown, unknown>) {
      updateYearFromX(event.x, true);
    });
  
  scrubber.call(scrubberDrag);
  
  // Click anywhere on timeline (for quick jumps when not dragging)
  svg.on('click', function(this: SVGSVGElement, event: MouseEvent) {
    if (event.detail === 1) { // Single click, not part of drag
      const [x] = d3.pointer(event, this);
      updateYearFromX(x, false);
    }
  });
  
  function updateScrubber() {
    scrubber.select('line')
      .attr('x1', xScale(currentYear))
      .attr('x2', xScale(currentYear));
    
    scrubber.select('circle')
      .attr('cx', xScale(currentYear));
    
    d3.select('#timeline-year').text(currentYear);
  }
  
  // Store update function for country highlight
  (window as any).updateTimelineCountryHighlight = (countryData: {year: number; total: number}[] | null) => {
    const countryPath = g.select('#timeline-country-area');
    if (countryData && countryData.length > 0) {
      countryPath
        .datum(countryData)
        .attr('d', area)
        .classed('highlighted', true);
    } else {
      countryPath.classed('highlighted', false);
    }
  };
  
  // Initial scrubber position
  updateScrubber();
}

function createMap(container: d3.Selection<any, unknown, null, undefined>) {
  const mapDiv = container.append('div').attr('class', 'map-container');
  
  const width = window.innerWidth;
  const height = window.innerHeight - 300; // Account for header, filters, timeline
  
  const svg = mapDiv.append('svg')
    .attr('class', 'map-svg')
    .attr('viewBox', `0 0 ${width} ${height}`);
  
  // Extract world map features (do once, reuse)
  let worldFeatures: any = null;
  try {
    worldFeatures = feature(worldTopo, worldTopo.objects.countries as any);
  } catch (error) {
    console.error('Error extracting world features:', error);
  }
  
  // Projection - handle case where worldTopo might be empty
  let projection;
  let path;
  if (worldFeatures && worldFeatures.features && worldFeatures.features.length > 0) {
    projection = d3.geoNaturalEarth1()
      .fitSize([width, height], worldFeatures);
    path = d3.geoPath().projection(projection);
  } else {
    // Empty projection if no map data
    projection = d3.geoNaturalEarth1().fitSize([width, height], { type: 'FeatureCollection', features: [] });
    path = d3.geoPath().projection(projection);
  }
  
  // Draw countries
  const countries = svg.append('g').attr('class', 'countries');
  
  try {
    
    if (worldFeatures && worldFeatures.features && worldFeatures.features.length > 0) {
      countries.selectAll('path')
        .data(worldFeatures.features)
        .enter()
        .append('path')
        .attr('class', 'country')
        .attr('d', path as any)
        // Initial fill handled by CSS - will be updated by updateVisualization
        .on('mouseenter', function(this: SVGPathElement, event: MouseEvent, d: any) {
          const countryCode = getCountryCode(d);
          if (countryCode) {
            hoveredCountry = countryCode;
            highlightCountry(countryCode);
            showTooltip(event, countryCode);
          }
        })
        .on('mousemove', function(event: MouseEvent) {
          positionTooltip(event);
        })
        .on('mouseleave', function() {
          hoveredCountry = null;
          clearHighlight();
          hideTooltip();
        })
        ;
      
      console.log('Map countries created:', countries.selectAll('path').size());
    } else {
      // No map data - show message
      svg.append('text')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', 'var(--text-muted)')
        .text('World map data unavailable');
    }
  } catch (error) {
    console.error('Error rendering map:', error);
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', height / 2)
      .attr('text-anchor', 'middle')
      .attr('fill', 'var(--text-muted)')
      .text('Error loading map');
  }
  
  // Legend
  const legend = mapDiv.append('div').attr('class', 'legend');
  legend.append('div').attr('class', 'legend-label').text('Catches');
  legend.append('div').attr('class', 'legend-gradient');
  legend.append('div').attr('class', 'legend-label').text('High');
  
  // Stats
  const stats = mapDiv.append('div').attr('class', 'stats');
  stats.append('div').attr('class', 'stat-value').attr('id', 'stat-total').text('0');
  stats.append('div').attr('class', 'stat-label').attr('id', 'stat-label').text(`Whale Catches in ${currentYear}`);
  
  // Store for updates
  (window as any).mapCountries = countries;
  
  const pathCount = countries.selectAll('path').size();
  console.log('Map created, countries selection stored:', pathCount, 'paths');
  
  // If paths exist, trigger initial color update
  if (pathCount > 0 && data) {
    console.log('Map paths ready, triggering initial color update');
    updateVisualization();
  }
}

function updateVisualization() {
  // Get data for current year and selected species
  const yearData = data.byCountryYear.filter(d => d.year === currentYear);
  
  // Filter by species if any selected
  let filteredData: CountryYearEntry[] = yearData;
  if (selectedSpecies.length > 0) {
    filteredData = yearData.map(d => {
      const filtered: CountryYearEntry = {
        ...d,
        total: 0,
        species: {}
      };
      selectedSpecies.forEach(species => {
        if (d.species[species]) {
          filtered.total += d.species[species];
          filtered.species[species] = d.species[species];
        }
      });
      return filtered;
    });
  }
  
  // Calculate totals
  const totalCatches = d3.sum(filteredData, (d: CountryYearEntry) => d.total);
  d3.select('#stat-total').text(totalCatches.toLocaleString());
  d3.select('#stat-label').text(`Whale Catches in ${currentYear}`);
  
  // Create lookup: country code -> catches
  const catchesByCountry = new Map<string, number>();
  filteredData.forEach(d => {
    if (d.code) {
      catchesByCountry.set(d.code, d.total);
    }
  });
  
  // Add catches for related countries (e.g., Greenland inherits Denmark's)
  Object.entries(RELATED_COUNTRY_MAP).forEach(([relatedCode, sourceCode]) => {
    const sourceCatches = catchesByCountry.get(sourceCode);
    if (sourceCatches !== undefined && !catchesByCountry.has(relatedCode)) {
      catchesByCountry.set(relatedCode, sourceCatches);
    }
  });
  
  const maxCatches = d3.max(Array.from(catchesByCountry.values())) || 1;
  
  // Color scale
  const colorScale = d3.scaleSequential(d3.interpolateReds)
    .domain([0, maxCatches]);
  
  // Update map colors
  const countries = (window as any).mapCountries;
  if (!countries) {
    console.warn('Map countries not available yet');
    return;
  }
  
  const paths = countries.selectAll('path.country');
  const pathCount = paths.size();
  
  if (pathCount === 0) {
    console.warn('No country paths found to color');
    return;
  }
  
  let coloredCount = 0;
  let noCodeCount = 0;
  let noDataCount = 0;
  
  paths.each(function(this: SVGPathElement, d: any) {
    const code = getCountryCode(d);
    const path = d3.select(this);
    
    if (!code) {
      path.style('fill', null);
      path.attr('fill', null); // Let CSS handle default
      path.classed('whaling', false);
      noCodeCount++;
      return;
    }
    
    // Get catches, including from related countries (e.g., Greenland inherits Denmark's)
    let catches = catchesByCountry.get(code) || 0;
    // If no direct data, check if this country should inherit from another
    if (catches === 0 && RELATED_COUNTRY_MAP[code]) {
      const sourceCode = RELATED_COUNTRY_MAP[code];
      catches = catchesByCountry.get(sourceCode) || 0;
      if (catches > 0) {
        console.log(`🇬🇱 Greenland (${code}) inheriting ${catches} catches from ${sourceCode}`);
      }
    }
    
    if (catches > 0) {
      const color = colorScale(catches);
      // Set style with !important to ensure it overrides CSS
      path.style('fill', color, 'important');
      path.classed('whaling', true);
      coloredCount++;
      // Log first few colored countries for debugging, including Greenland
      if (coloredCount <= 5 || code === 'GRL' || code === 'DNK') {
        console.log(`Colored ${code}: ${catches} catches → ${color}`);
      }
    } else {
      // Use CSS variable for default color by removing style
      path.style('fill', null);
      path.attr('fill', null); // Also clear attribute just in case
      path.classed('whaling', false);
      noDataCount++;
    }
  });
  
  console.log('Map colors updated:', {
    pathCount,
    coloredCount,
    noCodeCount,
    noDataCount,
    countriesWithCatches: Array.from(catchesByCountry.entries()).length,
    maxCatches,
    sampleCountries: Array.from(catchesByCountry.entries()).slice(0, 5).map(([code, catches]) => `${code}:${catches}`)
  });
  
  // Update timeline country highlight if hovering
  if (hoveredCountry) {
    highlightCountry(hoveredCountry);
  }
}

// Helper: Get related countries (e.g., Denmark + Greenland)
function getRelatedCountries(countryCode: string): string[] {
  const related: Record<string, string[]> = {
    'DNK': ['DNK', 'GRL'], // Denmark includes Greenland
    'GRL': ['DNK', 'GRL'], // Greenland is part of Denmark
  };
  return related[countryCode] || [countryCode];
}

function highlightCountry(countryCode: string) {
  // Get related countries (e.g., Denmark + Greenland)
  const relatedCodes = getRelatedCountries(countryCode);
  
  // Get country name (use first related country's name)
  const countryName = data.byCountryYear.find(d => relatedCodes.includes(d.code))?.country;
  if (!countryName) return;
  
  // Combine data from all related countries
  const countryTimeline = data.timeline.map(yearEntry => {
    let total = 0;
    relatedCodes.forEach(code => {
      const countryYearData = data.byCountryYear.find(
        d => d.year === yearEntry.year && d.code === code
      );
      if (countryYearData) {
        total += countryYearData.total || 0;
      }
    });
    return {
      year: yearEntry.year,
      total
    };
  });
  
  // Filter by selected species if needed
  if (selectedSpecies.length > 0) {
    countryTimeline.forEach(entry => {
      let total = 0;
      relatedCodes.forEach(code => {
        const countryYearData = data.byCountryYear.find(
          d => d.year === entry.year && d.code === code
        );
        if (countryYearData) {
          total += selectedSpecies.reduce((sum, species) => {
            return sum + (countryYearData.species[species] || 0);
          }, 0);
        }
      });
      entry.total = total;
    });
  }
  
  // Highlight all related countries on the map
  const countries = (window as any).mapCountries;
  if (countries) {
    countries.selectAll('path.country').each(function(this: SVGPathElement, d: any) {
      const code = getCountryCode(d);
      const path = d3.select(this);
      if (relatedCodes.includes(code)) {
        path.classed('highlighted', true);
      } else {
        path.classed('highlighted', false);
      }
    });
  }
  
  (window as any).updateTimelineCountryHighlight(countryTimeline);
}

function clearHighlight() {
  // Clear map highlights
  const countries = (window as any).mapCountries;
  if (countries) {
    countries.selectAll('path.country').classed('highlighted', false);
  }
  (window as any).updateTimelineCountryHighlight(null);
}

function showTooltip(event: MouseEvent, countryCode: string) {
  // Get related countries (e.g., Denmark + Greenland)
  const relatedCodes = getRelatedCountries(countryCode);
  
  // Combine data from all related countries
  const yearData = data.byCountryYear.filter(
    d => d.year === currentYear && relatedCodes.includes(d.code)
  );
  
  if (yearData.length === 0) return;
  
  // Combine totals and species from all related countries
  let total = 0;
  const species: Record<string, number> = {};
  const countryNames: string[] = [];
  
  yearData.forEach(country => {
    total += country.total || 0;
    countryNames.push(country.country);
    Object.entries(country.species || {}).forEach(([code, count]) => {
      species[code] = (species[code] || 0) + count;
    });
  });
  
  // Use combined country name
  const displayName = countryNames.length > 1 
    ? `${countryNames[0]} (incl. ${countryNames.slice(1).join(', ')})`
    : countryNames[0];
  
  // Filter by selected species
  if (selectedSpecies.length > 0) {
    total = selectedSpecies.reduce((sum, s) => sum + (species[s] || 0), 0);
    Object.keys(species).forEach(s => {
      if (!selectedSpecies.includes(s)) delete species[s];
    });
  }
  
  const tooltip = d3.select('.tooltip');
  tooltip.html(`
    <div class="tooltip-country">${displayName}</div>
    <div class="tooltip-total">${total.toLocaleString()}</div>
    <div class="tooltip-label">whales in ${currentYear}</div>
    ${Object.keys(species).length > 0 ? `
      <div class="tooltip-species">
        ${Object.entries(species)
          .filter(([_, count]) => count > 0)
          .map(([code, count]) => `
            <div class="tooltip-species-row">
              <span class="tooltip-species-name">${data.metadata.species[code] || code}</span>
              <span class="tooltip-species-count">${count.toLocaleString()}</span>
            </div>
          `).join('')}
      </div>
    ` : ''}
  `);
  
  tooltip.classed('visible', true);
  positionTooltip(event);
}

function positionTooltip(event: MouseEvent) {
  const tooltip = d3.select('.tooltip');
  if (!tooltip.classed('visible')) return;

  const x = event.clientX;
  const y = event.clientY;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const tooltipNode = tooltip.node() as HTMLElement;
  if (!tooltipNode) return;

  const tooltipWidth = tooltipNode.offsetWidth;
  const tooltipHeight = tooltipNode.offsetHeight;
  
  // Position lower-right by default
  let left = x + 20;
  let top = y + 20;
  
  // Flip to left if it would go off screen
  if (left + tooltipWidth > width - 20) {
    left = x - tooltipWidth - 20;
  }
  
  // Flip to top if it would go off screen
  if (top + tooltipHeight > height - 20) {
    top = y - tooltipHeight - 20;
  }
  
  tooltip
    .style('left', `${left}px`)
    .style('top', `${top}px`);
}

function hideTooltip() {
  d3.select('.tooltip').classed('visible', false);
}

// Handle window resize - debounced to avoid excessive re-renders
let resizeTimeout: number | null = null;
window.addEventListener('resize', () => {
  if (resizeTimeout) {
    clearTimeout(resizeTimeout);
  }
  resizeTimeout = window.setTimeout(() => {
    if (data && worldTopo) {
      // Re-render map on resize (only after resize stops)
      d3.select('.map-container').select('svg').remove();
      createMap(d3.select('#app') as any);
      updateVisualization();
    }
  }, 250); // Wait 250ms after last resize event
});

// Start
init();
