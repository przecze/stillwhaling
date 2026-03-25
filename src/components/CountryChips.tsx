import { useMemo, useRef } from 'react';
import { WhalingData } from '../types';
import { RELATED_COUNTRY_MAP } from '../constants';
import './country-chips.css';

const ISO3_TO_ISO2: Record<string, string> = {
  'AUS': 'AU', 'BRA': 'BR', 'CAN': 'CA', 'CHN': 'CN', 'DNK': 'DK',
  'FIN': 'FI', 'FRA': 'FR', 'DEU': 'DE', 'GRL': 'GL', 'ISL': 'IS',
  'IDN': 'ID', 'IRL': 'IE', 'JPN': 'JP', 'KOR': 'KR', 'MEX': 'MX',
  'NLD': 'NL', 'NZL': 'NZ', 'NOR': 'NO', 'PRT': 'PT', 'RUS': 'RU',
  'ZAF': 'ZA', 'ESP': 'ES', 'SWE': 'SE', 'GBR': 'GB', 'USA': 'US',
  'VCT': 'VC', 'PHL': 'PH', 'TWN': 'TW', 'URY': 'UY', 'PER': 'PE',
  'ARG': 'AR', 'CHL': 'CL',
};

function getFlag(iso3: string): string {
  const iso2 = ISO3_TO_ISO2[iso3];
  if (!iso2) return '';
  return Array.from(iso2)
    .map(c => String.fromCodePoint(c.charCodeAt(0) - 65 + 0x1f1e6))
    .join('');
}

export interface ChipHover {
  code: string;
  mobile: boolean;
  key: number;
}

interface Props {
  data: WhalingData;
  currentYear: number;
  selectedSpecies: string[];
  onChipHover: (hover: ChipHover | null) => void;
  activeCode: string | null;
}

export default function CountryChips({ data, currentYear, selectedSpecies, onChipHover, activeCode }: Props) {
  const touchActiveRef = useRef(false);

  const chips = useMemo(() => {
    const yearData = data.byCountryYear.filter(d => d.year === currentYear);

    const catchesByCode = new Map<string, number>();
    const nameByCode = new Map<string, string>();
    yearData.forEach(d => {
      const catches = selectedSpecies.length > 0
        ? selectedSpecies.reduce((sum, s) => sum + (d.species[s] || 0), 0)
        : d.total;
      catchesByCode.set(d.code, catches);
      nameByCode.set(d.code, d.country);
    });

    // Merge satellites into primary codes
    const merged = new Map<string, number>();
    catchesByCode.forEach((catches, code) => {
      const primary = RELATED_COUNTRY_MAP[code] || code;
      merged.set(primary, (merged.get(primary) || 0) + catches);
    });

    return Array.from(merged.entries())
      .filter(([, total]) => total > 0)
      .map(([code, total]) => ({ code, name: nameByCode.get(code) || code, total }))
      .sort((a, b) => b.total - a.total);
  }, [data, currentYear, selectedSpecies]);

  if (chips.length === 0) return null;

  return (
    <div className="country-chips-bar">
      {chips.map(({ code, name, total }) => (
        <div
          key={code}
          className={`country-chip${activeCode === code ? ' active' : ''}`}
          onMouseEnter={() => { if (!touchActiveRef.current) onChipHover({ code, mobile: false, key: Date.now() }); }}
          onMouseLeave={() => { if (!touchActiveRef.current) onChipHover(null); }}
          onTouchStart={(e) => { e.stopPropagation(); touchActiveRef.current = true; setTimeout(() => { touchActiveRef.current = false; }, 500); onChipHover({ code, mobile: true, key: Date.now() }); }}
        >
          <span className="chip-flag">{getFlag(code)}</span>
          <span className="chip-name">{name}</span>
          <span className="chip-total">{total.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}
