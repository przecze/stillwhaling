// Countries whose data is reported together (satellite → primary)
// e.g. Greenland catches are reported under Denmark
export const RELATED_COUNTRY_MAP: Record<string, string> = {
  'GRL': 'DNK',
};

// All country codes that should be treated as a group when one is selected
export const RELATED_GROUPS: Record<string, string[]> = {
  'DNK': ['DNK', 'GRL'],
  'GRL': ['DNK', 'GRL'],
};
