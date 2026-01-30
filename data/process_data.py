#!/usr/bin/env python3
"""
Process IWC whaling catches data for stillwhaling.com visualization.
Reads from ~/Downloads, outputs JSON for the frontend.
"""

import pandas as pd
import json
from pathlib import Path

# Paths
DOWNLOADS = Path.home() / "Downloads"
OUTPUT_DIR = Path(__file__).parent.parent / "public" / "data"

# Species mapping (column name -> display name)
SPECIES = {
    'TBlue': 'Blue Whale',
    'PBlue': 'Pygmy Blue Whale', 
    'Fin': 'Fin Whale',
    'Spm': 'Sperm Whale',
    'Hbk': 'Humpback Whale',
    'Sei': 'Sei Whale',
    'Bryd': "Bryde's Whale",
    'Mi:C': 'Common Minke',
    'Mi:A': 'Antarctic Minke',
    'Gray': 'Gray Whale',
    'Bhd': 'Bowhead Whale',
    'Ri': 'Right Whale',
    'Unsp': 'Unspecified',
}

# Country name -> ISO 3166-1 alpha-3 code (for map)
COUNTRY_CODES = {
    'Japan': 'JPN',
    'USSR': 'RUS',  # Map to Russia for visualization
    'Russia': 'RUS',
    'Indonesia': 'IDN',
    'Denmark': 'DNK',  # Includes Greenland/Faroe Islands
    'Iceland': 'ISL',
    'Norway': 'NOR',
    'Saint Vincent & the Grenadines': 'VCT',
    'Korea': 'KOR',
    'United States': 'USA',
    'Portugal': 'PRT',
    'Canada': 'CAN',
}

def find_dataset():
    """Find the most recent IWC catches dataset in Downloads."""
    xlsx_files = list(DOWNLOADS.glob("*catches*.xlsx")) + list(DOWNLOADS.glob("*Catches*.xlsx"))
    if not xlsx_files:
        raise FileNotFoundError(
            "No IWC catches dataset found in Downloads.\n"
            "Download from: https://iwc.int/management-and-conservation/whaling/total-catches"
        )
    xlsx_files.sort(key=lambda f: f.stat().st_mtime, reverse=True)
    return xlsx_files[0]

def main():
    # Find and load dataset
    dataset_path = find_dataset()
    print(f"📂 Loading: {dataset_path.name}")
    
    df = pd.read_excel(dataset_path, sheet_name=0)
    print(f"📊 Loaded {len(df)} records")
    
    # Species columns that exist in this dataset
    species_cols = [col for col in SPECIES.keys() if col in df.columns]
    
    # Add ISO country codes
    df['CountryCode'] = df['Nation'].map(COUNTRY_CODES)
    
    # Aggregate by Year and Nation
    yearly_by_country = df.groupby(['Year', 'Nation', 'CountryCode']).agg({
        **{col: 'sum' for col in species_cols},
        'Total': 'sum'
    }).reset_index()
    
    # Global yearly totals
    yearly_global = df.groupby('Year').agg({
        **{col: 'sum' for col in species_cols},
        'Total': 'sum'
    }).reset_index()
    
    # Species yearly totals (for filter functionality)
    species_yearly = []
    for year in sorted(df['Year'].unique()):
        year_data = df[df['Year'] == year]
        row = {'year': int(year)}
        for col, name in SPECIES.items():
            if col in year_data.columns:
                row[col] = int(year_data[col].sum())
        row['total'] = int(year_data['Total'].sum())
        species_yearly.append(row)
    
    # Build output structure
    output = {
        'metadata': {
            'source': 'IWC Total Catches Database',
            'url': 'https://iwc.int/management-and-conservation/whaling/total-catches',
            'years': [int(y) for y in sorted(df['Year'].unique())],
            'countries': list(COUNTRY_CODES.keys()),
            'species': SPECIES,
        },
        'timeline': species_yearly,
        'byCountryYear': [],
    }
    
    # Country-year data for map
    for _, row in yearly_by_country.iterrows():
        entry = {
            'year': int(row['Year']),
            'country': row['Nation'],
            'code': row['CountryCode'],
            'total': int(row['Total']),
            'species': {}
        }
        for col in species_cols:
            if row[col] > 0:
                entry['species'][col] = int(row[col])
        output['byCountryYear'].append(entry)
    
    # Create output directory
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # Write JSON
    output_path = OUTPUT_DIR / 'whaling_data.json'
    with open(output_path, 'w') as f:
        json.dump(output, f, indent=2)
    
    print(f"✅ Written to: {output_path}")
    print(f"   Years: {output['metadata']['years'][0]} - {output['metadata']['years'][-1]}")
    print(f"   Countries: {len(output['metadata']['countries'])}")
    print(f"   Records: {len(output['byCountryYear'])}")
    
    # Summary stats
    print(f"\n📈 Top whaling nations (all time):")
    totals = yearly_by_country.groupby('Nation')['Total'].sum().sort_values(ascending=False)
    for nation, total in totals.head(10).items():
        print(f"   {nation}: {total:,} whales")

if __name__ == "__main__":
    main()
