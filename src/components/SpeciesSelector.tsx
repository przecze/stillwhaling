import { useState, useMemo } from 'react';
import { WhalingData } from '../types';
import './species-selector.css';

interface Props {
  data: WhalingData;
  selectedSpecies: string[];
  onSpeciesChange: (species: string[]) => void;
}

export default function SpeciesSelector({ data, selectedSpecies, onSpeciesChange }: Props) {
  const [expanded, setExpanded] = useState(false);

  const speciesInDataset = useMemo(() => {
    const set = new Set<string>();
    data.byCountryYear.forEach(entry => {
      Object.entries(entry.species).forEach(([code, count]) => {
        if (count > 0) set.add(code);
      });
    });
    return set;
  }, [data]);

  const speciesTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    data.byCountryYear.forEach(entry => {
      Object.entries(entry.species).forEach(([code, count]) => {
        totals[code] = (totals[code] ?? 0) + count;
      });
    });
    return totals;
  }, [data]);

  const speciesEntries = useMemo(() =>
    Object.entries(data.metadata.species)
      .filter(([code]) => speciesInDataset.has(code))
      .sort(([a], [b]) => (speciesTotals[b] ?? 0) - (speciesTotals[a] ?? 0)),
    [data, speciesInDataset, speciesTotals]
  );

  function toggleSpecies(code: string) {
    if (selectedSpecies.includes(code)) {
      onSpeciesChange(selectedSpecies.filter(s => s !== code));
    } else {
      onSpeciesChange([...selectedSpecies, code]);
    }
  }

  function selectAll() {
    onSpeciesChange([]);
  }

  function currentLabel() {
    if (selectedSpecies.length === 0) return 'All';
    if (selectedSpecies.length === 1) return data.metadata.species[selectedSpecies[0]] || selectedSpecies[0];
    return `${selectedSpecies.length} selected`;
  }

  return (
    <div className={`filters${expanded ? ' expanded' : ''}`}>
      <div className="filters-header" onClick={() => setExpanded(e => !e)}>
        <span className="filters-toggle-icon">▾</span>
        <span className="filters-label">Species</span>
        <span className="filters-current">{currentLabel()}</span>
      </div>
      <div className="filters-body">
        <button
          className={`filter-btn${selectedSpecies.length === 0 ? ' active' : ''}`}
          onClick={selectAll}
        >
          All
        </button>
        {speciesEntries.map(([code, name]) => (
          <button
            key={code}
            className={`filter-btn${selectedSpecies.includes(code) ? ' active' : ''}`}
            onClick={() => toggleSpecies(code)}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  );
}
