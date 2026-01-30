export interface WhalingData {
  metadata: {
    source: string;
    url: string;
    years: number[];
    countries: string[];
    species: Record<string, string>;
  };
  timeline: TimelineEntry[];
  byCountryYear: CountryYearEntry[];
}

export interface TimelineEntry {
  year: number;
  total: number;
  [speciesCode: string]: number;
}

export interface CountryYearEntry {
  year: number;
  country: string;
  code: string;
  total: number;
  species: Record<string, number>;
}
