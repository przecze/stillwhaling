import { useState, useEffect, useCallback } from 'react';
import { WhalingData } from './types';
import Header from './components/Header';
import SpeciesSelector from './components/SpeciesSelector';
import Timeline from './components/Timeline';
import Map from './components/Map';
import CountryChips, { ChipHover } from './components/CountryChips';
import Footer from './components/Footer';

function createEmptyTopo() {
  return { objects: { countries: { type: 'GeometryCollection', geometries: [] } } };
}

export default function App() {
  const [data, setData] = useState<WhalingData | null>(null);
  const [worldTopo, setWorldTopo] = useState<any>(null);
  const [currentYear, setCurrentYear] = useState<number>(0);
  const [selectedSpecies, setSelectedSpecies] = useState<string[]>([]);
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);
  const [chipHover, setChipHover] = useState<ChipHover | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mapKey, setMapKey] = useState(0);

  useEffect(() => {
    async function init() {
      try {
        const dataResponse = await fetch('/data/whaling_data.json', {
          cache: 'no-cache',
          headers: { 'Cache-Control': 'no-cache' }
        });

        if (!dataResponse.ok) {
          const errorText = await dataResponse.text();
          throw new Error(`HTTP ${dataResponse.status}: ${dataResponse.statusText}\n${errorText.substring(0, 200)}`);
        }

        const loaded: WhalingData = await dataResponse.json();

        if (!loaded.metadata || !loaded.timeline || !loaded.byCountryYear) {
          throw new Error('Invalid data structure: missing metadata, timeline, or byCountryYear');
        }

        const years = loaded.metadata.years;
        // Use last year that actually has catch data, not just last year in metadata
        const lastYearWithData = loaded.byCountryYear.reduce((max, d) => d.year > max ? d.year : max, years[0]);
        const initialYear = lastYearWithData;
        setData(loaded);
        setCurrentYear(initialYear);

        // Load world map non-blocking
        try {
          const mapUrl = 'https://unpkg.com/world-atlas@1.1.4/world/110m.json';
          const response = await fetch(mapUrl, { signal: AbortSignal.timeout(5000) });
          if (response.ok) {
            setWorldTopo(await response.json());
          } else {
            setWorldTopo(createEmptyTopo());
          }
        } catch {
          setWorldTopo(createEmptyTopo());
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }

    init();
  }, []);

  const handleResize = useCallback(() => {
    setMapKey(k => k + 1);
  }, []);

  useEffect(() => {
    let timeout: number;
    const onResize = () => {
      clearTimeout(timeout);
      timeout = window.setTimeout(handleResize, 250);
    };
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); clearTimeout(timeout); };
  }, [handleResize]);

  if (error) {
    return (
      <div className="loading error-panel">
        <h2>Failed to load data</h2>
        <p className="error-message">{error}</p>
        <p className="error-hint">
          Check the browser console for details. Make sure:<br />
          • Dev server is running on port 3000<br />
          • Data file exists at public/data/whaling_data.json<br />
          • Run: <code className="command-note">uv run python data/process_data.py</code>
        </p>
      </div>
    );
  }

  if (!data || !worldTopo) {
    return <div className="loading">Loading</div>;
  }

  return (
    <>
      <Header />
      <SpeciesSelector
        data={data}
        selectedSpecies={selectedSpecies}
        onSpeciesChange={setSelectedSpecies}
      />
      <Timeline
        data={data}
        currentYear={currentYear}
        onYearChange={setCurrentYear}
        hoveredCountry={hoveredCountry}
        selectedSpecies={selectedSpecies}
      />
      <div className="map-section">
        <Map
          key={mapKey}
          data={data}
          worldTopo={worldTopo}
          currentYear={currentYear}
          selectedSpecies={selectedSpecies}
          onHoverCountry={setHoveredCountry}
          chipHover={chipHover}
        />
        <CountryChips
          data={data}
          currentYear={currentYear}
          selectedSpecies={selectedSpecies}
          onChipHover={setChipHover}
          activeCode={chipHover?.code ?? null}
        />
      </div>
      <Footer />
    </>
  );
}
