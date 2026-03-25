import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { WhalingData } from '../types';
import './timeline.css';

const RELATED_COUNTRY_MAP: Record<string, string[]> = {
  'DNK': ['DNK', 'GRL'],
  'GRL': ['DNK', 'GRL'],
};

interface Props {
  data: WhalingData;
  currentYear: number;
  onYearChange: (year: number) => void;
  hoveredCountry: string | null;
  selectedSpecies: string[];
}

export default function Timeline({ data, currentYear, onYearChange, hoveredCountry, selectedSpecies }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const scrubberRef = useRef<SVGGElement>(null);
  const xScaleRef = useRef<d3.ScaleLinear<number, number>>(null!);
  const countryAreaRef = useRef<d3.Selection<SVGPathElement, unknown, null, undefined>>(null!);
  const areaFnRef = useRef<d3.Area<{ year: number; total: number }>>(null!);
  const currentYearRef = useRef(currentYear);

  // Build chart once on mount
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const svgHeight = 80;
    const totalWidth = svgEl.getBoundingClientRect().width || 920;
    const margin = { top: 10, right: 40, bottom: 20, left: 40 };
    const width = totalWidth - margin.left - margin.right;
    const height = svgHeight - margin.top - margin.bottom;

    const svg = d3.select(svgEl).attr('viewBox', `0 0 ${totalWidth} ${svgHeight}`);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const xScale = d3.scaleLinear()
      .domain(d3.extent(data.metadata.years) as [number, number])
      .range([0, width]);
    xScaleRef.current = xScale;

    const maxTotal = d3.max(data.timeline, d => d.total) || 0;
    const yScale = d3.scaleLinear().domain([0, maxTotal]).range([height, 0]);

    const line = d3.line<{ year: number; total: number }>()
      .x(d => xScale(d.year))
      .y(d => yScale(d.total))
      .curve(d3.curveMonotoneX);

    const area = d3.area<{ year: number; total: number }>()
      .x(d => xScale(d.year))
      .y0(height)
      .y1(d => yScale(d.total))
      .curve(d3.curveMonotoneX);
    areaFnRef.current = area;

    g.append('path').datum(data.timeline).attr('class', 'timeline-area').attr('d', area);
    g.append('path').datum(data.timeline).attr('class', 'timeline-line').attr('d', line);

    countryAreaRef.current = g.append('path')
      .attr('class', 'timeline-country-area')
      .attr('id', 'timeline-country-area') as any;

    // Scrubber — translate to chart coordinate space so positions align with chart
    const scrubber = d3.select(scrubberRef.current)
      .attr('transform', `translate(${margin.left},${margin.top})`);
    scrubber.append('line')
      .attr('class', 'timeline-scrubber')
      .attr('x1', xScale(currentYearRef.current)).attr('x2', xScale(currentYearRef.current))
      .attr('y1', 0).attr('y2', height);
    scrubber.append('circle')
      .attr('class', 'timeline-scrubber-head')
      .attr('cx', xScale(currentYearRef.current)).attr('cy', height).attr('r', 6);

    // X axis
    g.append('g')
      .attr('class', 'timeline-axis')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(xScale).ticks(10).tickFormat(d => String(d)));

    // Interactions
    function updateFromX(x: number, relative = false) {
      const adjusted = relative ? Math.max(0, Math.min(width, x)) : x - margin.left;
      if (adjusted >= 0 && adjusted <= width) {
        const year = Math.round(xScale.invert(adjusted));
        if (year >= data.metadata.years[0] && year <= data.metadata.years[data.metadata.years.length - 1]) {
          onYearChange(year);
        }
      }
    }

    svg.call(d3.drag<SVGSVGElement, unknown>().on('drag', function(event) {
      const [x] = d3.pointer(event, this);
      updateFromX(x, false);
    }));

    scrubber.call(d3.drag<SVGGElement, unknown>().on('drag', function(event) {
      const [x] = d3.pointer(event, svgEl);
      updateFromX(x, false);
    }));

    svg.on('click', function(event: MouseEvent) {
      if (event.detail === 1) {
        const [x] = d3.pointer(event, this);
        updateFromX(x, false);
      }
    });

    return () => {
      // Remove D3-appended chart group; clear scrubber children (React-managed group stays)
      d3.select(svgEl).selectAll('g:not(.timeline-scrubber-group)').remove();
      d3.select(scrubberRef.current).selectAll('*').remove();
      xScaleRef.current = null!;
      areaFnRef.current = null!;
      countryAreaRef.current = null!;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update scrubber position when year changes
  useEffect(() => {
    currentYearRef.current = currentYear;
    if (!scrubberRef.current || !xScaleRef.current) return;
    const scrubber = d3.select(scrubberRef.current);
    const x = xScaleRef.current(currentYear);
    scrubber.select('line').attr('x1', x).attr('x2', x);
    scrubber.select('circle').attr('cx', x);
    d3.select('#timeline-year').text(currentYear);
  }, [currentYear]);

  // Update country highlight when hovered country or species filter changes
  useEffect(() => {
    if (!countryAreaRef.current || !areaFnRef.current) return;

    if (!hoveredCountry) {
      countryAreaRef.current.classed('highlighted', false);
      return;
    }

    const relatedCodes = RELATED_COUNTRY_MAP[hoveredCountry] || [hoveredCountry];

    const countryTimeline = data.timeline.map(yearEntry => {
      let total = 0;
      relatedCodes.forEach(code => {
        const entry = data.byCountryYear.find(d => d.year === yearEntry.year && d.code === code);
        if (entry) {
          if (selectedSpecies.length > 0) {
            total += selectedSpecies.reduce((sum, s) => sum + (entry.species[s] || 0), 0);
          } else {
            total += entry.total || 0;
          }
        }
      });
      return { year: yearEntry.year, total };
    });

    countryAreaRef.current
      .datum(countryTimeline)
      .attr('d', areaFnRef.current)
      .classed('highlighted', true);
  }, [hoveredCountry, selectedSpecies, data]);

  return (
    <div className="timeline-container">
      <div className="timeline-header">
        <div className="timeline-title">Global Whale Catches</div>
        <div className="timeline-year" id="timeline-year">{currentYear}</div>
      </div>
      <svg ref={svgRef} className="timeline-svg">
        <g ref={scrubberRef} className="timeline-scrubber-group" />
      </svg>
    </div>
  );
}
