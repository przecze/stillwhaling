import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { feature } from 'topojson-client';
import { WhalingData, CountryYearEntry } from '../types';
import { ChipHover } from './CountryChips';
import { RELATED_COUNTRY_MAP, RELATED_GROUPS } from '../constants';
import './map.css';

const NUMERIC_TO_ISO: Record<string, string> = {
  '392': 'JPN', '643': 'RUS', '360': 'IDN', '208': 'DNK', '304': 'GRL',
  '352': 'ISL', '578': 'NOR', '670': 'VCT', '410': 'KOR', '840': 'USA',
  '620': 'PRT', '124': 'CAN',
};

function getCountryCode(d: any): string {
  let code = d.properties?.ISO_A3 || d.properties?.iso_a3 || d.id;
  if (code && /^\d+$/.test(String(code))) {
    code = NUMERIC_TO_ISO[String(code)] || code;
  }
  return code || '';
}

interface TooltipData {
  x: number;
  y: number;
  centered?: boolean;
  countryName: string;
  total: number;
  year: number;
  species: Record<string, number>;
  speciesNames: Record<string, string>;
}

interface Props {
  data: WhalingData;
  worldTopo: any;
  currentYear: number;
  selectedSpecies: string[];
  onHoverCountry: (code: string | null) => void;
  chipHover?: ChipHover | null;
}

export default function MapChart({ data, worldTopo, currentYear, selectedSpecies, onHoverCountry, chipHover }: Props) {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const countriesRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined>>(null!);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);


  // Ref so chipHover effect always calls the latest showTooltipFor closure
  const showTooltipForRef = useRef<(code: string, event: MouseEvent | null, centered: boolean) => void>(() => {});

  // Keep color logic in a ref so build effect can call it with latest values
  const colorCountriesRef = useRef<() => void>(() => {});
  colorCountriesRef.current = () => {
    if (!countriesRef.current) return;

    const yearData = data.byCountryYear.filter(d => d.year === currentYear);
    let filteredData: CountryYearEntry[] = yearData;

    if (selectedSpecies.length > 0) {
      filteredData = yearData.map(d => ({
        ...d,
        total: selectedSpecies.reduce((sum, s) => sum + (d.species[s] || 0), 0),
        species: Object.fromEntries(selectedSpecies.filter(s => d.species[s]).map(s => [s, d.species[s]]))
      }));
    }

    const catchesByCountry = new Map<string, number>();
    filteredData.forEach(d => { if (d.code) catchesByCountry.set(d.code, d.total); });

    Object.entries(RELATED_COUNTRY_MAP).forEach(([related, source]) => {
      const src = catchesByCountry.get(source);
      if (src !== undefined && !catchesByCountry.has(related)) {
        catchesByCountry.set(related, src);
      }
    });

    const maxCatches = d3.max(Array.from(catchesByCountry.values())) || 1;
    const colorScale = d3.scaleSequential(d3.interpolateReds).domain([0, maxCatches]);

    d3.select('#stat-total').text(d3.sum(filteredData, d => d.total).toLocaleString());
    d3.select('#stat-label').text(`Whale Catches in ${currentYear}`);

    countriesRef.current.selectAll<SVGPathElement, any>('path.country').each(function(d) {
      const code = getCountryCode(d);
      const p = d3.select(this);
      let catches = catchesByCountry.get(code) || 0;
      if (catches === 0 && RELATED_COUNTRY_MAP[code]) {
        catches = catchesByCountry.get(RELATED_COUNTRY_MAP[code]) || 0;
      }
      if (catches > 0) {
        p.style('fill', colorScale(catches)).classed('whaling', true);
      } else {
        p.style('fill', null).attr('fill', null).classed('whaling', false);
      }
    });
  };

  // Build map once on mount
  useEffect(() => {
    const mapDiv = mapDivRef.current;
    const svgEl = svgRef.current;
    if (!mapDiv || !svgEl) return;

    let worldFeatures: any = null;
    try {
      worldFeatures = feature(worldTopo, worldTopo.objects.countries as any);
    } catch { /* no map data */ }

    const width = mapDiv.clientWidth || window.innerWidth;
    let naturalHeight: number;
    let projection: d3.GeoProjection;
    let path: d3.GeoPath;

    if (worldFeatures?.features?.length > 0) {
      const refProj = d3.geoNaturalEarth1().fitWidth(width, worldFeatures);
      const [[, ry0], [, ry1]] = d3.geoPath().projection(refProj).bounds(worldFeatures);
      naturalHeight = Math.ceil(ry1 - ry0);
      projection = d3.geoNaturalEarth1().fitSize([width, naturalHeight], worldFeatures);
      path = d3.geoPath().projection(projection);
    } else {
      naturalHeight = Math.round(width * 0.5);
      projection = d3.geoNaturalEarth1().fitSize([width, naturalHeight], { type: 'FeatureCollection', features: [] });
      path = d3.geoPath().projection(projection);
    }

    // Crop just above Antarctica: project -62°S, but never exceed container height
    const antarcticPt = projection([0, -62]);
    const latCropHeight = antarcticPt ? antarcticPt[1] : naturalHeight * 0.78;
    const croppedHeight = Math.round(Math.min(latCropHeight, mapDiv.clientHeight || latCropHeight));

    // Cap the container to exactly the SVG's natural height so chips sit flush below
    mapDiv.style.maxHeight = croppedHeight + 'px';

    const svg = d3.select(svgEl)
      .attr('class', 'map-svg')
      .attr('viewBox', `0 0 ${width} ${croppedHeight}`)
      .on('pointerdown', function(event: PointerEvent) {
        if (event.pointerType === 'touch' && !(event.target as Element).classList.contains('country')) {
          setTooltip(null);
          onHoverCountry(null);
          clearHighlight();
        }
      });

    const countries = svg.append('g').attr('class', 'countries');
    countriesRef.current = countries;

    if (worldFeatures?.features?.length > 0) {
      countries.selectAll('path')
        .data(worldFeatures.features)
        .enter()
        .append('path')
        .attr('class', 'country')
        .attr('d', path as any)
        .on('pointerenter', function(event: PointerEvent, d: any) {
          if (event.pointerType !== 'mouse') return;
          const code = getCountryCode(d);
          if (!code) return;
          onHoverCountry(code);
          showTooltipForRef.current(code, event, false);
          highlightCountry(code);
        })
        .on('pointermove', function(event: PointerEvent) {
          if (event.pointerType !== 'mouse') return;
          setTooltip(prev => prev ? positionedTooltip(prev, event) : null);
        })
        .on('pointerleave', function(event: PointerEvent) {
          if (event.pointerType !== 'mouse') return;
          onHoverCountry(null);
          setTooltip(null);
          clearHighlight();
        })
        .on('pointerdown', function(event: PointerEvent, d: any) {
          if (event.pointerType !== 'touch') return;
          event.stopPropagation();
          const code = getCountryCode(d);
          if (!code) return;
          onHoverCountry(code);
          showTooltipForRef.current(code, null, true);
          highlightCountry(code);
        });
    } else {
      svg.append('text')
        .attr('x', width / 2).attr('y', naturalHeight / 2)
        .attr('text-anchor', 'middle').attr('fill', 'var(--text-muted)')
        .text('World map data unavailable');
    }

    // Apply initial colors right after building — don't rely on a separate effect firing after this one
    colorCountriesRef.current();

    return () => {
      mapDiv.style.maxHeight = '';
      if (svgRef.current) d3.select(svgRef.current).selectAll('*').remove();
      countriesRef.current = null!;
    };
  }, [worldTopo]); // eslint-disable-line react-hooks/exhaustive-deps -- other values (data, year, species) are read via colorCountriesRef, not as deps

  // Update colors when year or species filter changes
  useEffect(() => {
    colorCountriesRef.current();
  }, [currentYear, selectedSpecies, data]);

  function highlightCountry(code: string) {
    if (!countriesRef.current) return;
    const relatedCodes = RELATED_GROUPS[code] || [code];
    countriesRef.current.selectAll<SVGPathElement, any>('path.country').each(function(d) {
      const c = getCountryCode(d);
      const el = d3.select(this);
      el.classed('highlighted', relatedCodes.includes(c) && el.classed('whaling'));
    });
  }

  function clearHighlight() {
    if (!countriesRef.current) return;
    countriesRef.current.selectAll('path.country').classed('highlighted', false);
  }

  function positionedTooltip(prev: TooltipData, event: MouseEvent): TooltipData {
    return { ...prev, x: event.clientX, y: event.clientY };
  }

  // Keep ref current so the chipHover effect always calls the latest closure
  showTooltipForRef.current = showTooltipFor;

  function showTooltipFor(code: string, event: MouseEvent | null, centered: boolean) {
    const relatedCodes = RELATED_GROUPS[code] || [code];
    const yearData = data.byCountryYear.filter(d => d.year === currentYear && relatedCodes.includes(d.code));
    if (yearData.length === 0) return;

    let total = 0;
    const species: Record<string, number> = {};
    const names: string[] = [];

    yearData.forEach(country => {
      total += country.total || 0;
      names.push(country.country);
      Object.entries(country.species || {}).forEach(([s, count]) => {
        species[s] = (species[s] || 0) + count;
      });
    });

    if (selectedSpecies.length > 0) {
      total = selectedSpecies.reduce((sum, s) => sum + (species[s] || 0), 0);
      Object.keys(species).forEach(s => { if (!selectedSpecies.includes(s)) delete species[s]; });
    }

    const displayName = names.length > 1
      ? `${names[0]} (incl. ${names.slice(1).join(', ')})`
      : names[0];

    setTooltip({
      x: event?.clientX ?? 0, y: event?.clientY ?? 0,
      centered,
      countryName: displayName, total, year: currentYear,
      species, speciesNames: data.metadata.species,
    });
  }

  // Show/clear tooltip when a chip is hovered externally
  useEffect(() => {
    if (!chipHover) {
      setTooltip(null);
      clearHighlight();
      return;
    }
    const { code, mobile } = chipHover;
    highlightCountry(code);
    if (mobile) {
      showTooltipForRef.current(code, null, true);
      return;
    }
    // Find the country's SVG path and position the tooltip at its center
    if (!countriesRef.current) return;
    const relatedCodes = RELATED_GROUPS[code] || [code];
    let el: SVGPathElement | null = null;
    countriesRef.current.selectAll<SVGPathElement, any>('path.country').each(function(d: any) {
      if (relatedCodes.includes(getCountryCode(d))) el = this;
    });
    if (el) {
      const rect = (el as SVGPathElement).getBoundingClientRect();
      showTooltipForRef.current(
        code,
        { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 } as MouseEvent,
        false,
      );
    } else {
      showTooltipForRef.current(code, null, true);
    }
  }, [chipHover]); // eslint-disable-line react-hooks/exhaustive-deps -- showTooltipFor is accessed via showTooltipForRef, not as a dep

  // Compute tooltip position
  function tooltipStyle(t: TooltipData) {
    const node = tooltipRef.current;
    const w = node?.offsetWidth || 0;
    const h = node?.offsetHeight || 0;
    let left = t.x + 20;
    let top = t.y + 20;
    if (left + w > window.innerWidth - 20) left = t.x - w - 20;
    if (top + h > window.innerHeight - 20) top = t.y - h - 20;
    return { left, top };
  }

  const tooltipPosition = tooltip ? tooltipStyle(tooltip) : { left: 0, top: 0 };

  return (
    <>
      <div ref={mapDivRef} className="map-container">
        <div className="map-svg-wrap">
          <svg ref={svgRef} />
          <div className="map-stats-overlay">
            <div className="stat-value" id="stat-total"></div>
            <div className="stat-label" id="stat-label"></div>
          </div>
        </div>
      </div>

      <div
        ref={tooltipRef}
        className={`tooltip${tooltip ? ' visible' : ''}${tooltip?.centered ? ' centered' : ''}`}
        style={tooltip?.centered ? {} : { left: tooltipPosition.left, top: tooltipPosition.top }}
      >
        {tooltip && (
          <>
            <div className="tooltip-country">{tooltip.countryName}</div>
            <div className="tooltip-total">{tooltip.total.toLocaleString()}</div>
            <div className="tooltip-label">whales in {tooltip.year}</div>
            {Object.keys(tooltip.species).length > 0 && (
              <div className="tooltip-species">
                {Object.entries(tooltip.species)
                  .filter(([, count]) => (count as number) > 0)
                  .map(([code, count]) => (
                    <div key={code} className="tooltip-species-row">
                      <span className="tooltip-species-name">{tooltip.speciesNames[code] || code}</span>
                      <span className="tooltip-species-count">{count.toLocaleString()}</span>
                    </div>
                  ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
