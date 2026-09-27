#!/usr/bin/env python3
"""Prepare official 2024 ACS 5-year county and district population for Supabase.

Writes compact JSON for import; does not need a Census API key or DB credentials.
Usage: python3 scripts/prepare-census-population.py /tmp/spoylt-population.json
"""
import csv
import json
import sys
import urllib.request

BASE = 'https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/'
GEOS = BASE + 'documentation/Geos20245YR.txt'
POPULATION = BASE + 'data/5YRData/acsdt5y2024-b01003.dat'
TYPES = {
    '050': ('county', 'COUNTY'),
    '500': ('congressional', 'CDCURR'),
    '610': ('state_senate', 'SLDU'),
    '620': ('state_house', 'SLDL'),
    '950': ('school_elementary', 'SDELM'),
    '960': ('school_secondary', 'SDSEC'),
    '970': ('school_unified', 'SDUNI'),
}


def rows(url, delimiter):
    with urllib.request.urlopen(url, timeout=120) as response:
        yield from csv.DictReader((line.decode('latin1') for line in response), delimiter=delimiter)


def main():
    if len(sys.argv) != 2:
        raise SystemExit('Usage: prepare-census-population.py OUTPUT.json')
    areas = {}
    for row in rows(GEOS, '|'):
        choice = TYPES.get(row['SUMLEVEL'])
        if not choice or row['COMPONENT'] != '00' or len(row['STUSAB']) != 2:
            continue
        area_type, code_column = choice
        if not row[code_column] or not row['STATE'] or not row['GEO_ID']:
            continue
        # 99999 is an aggregate "Remainder of state," not an election district.
        if area_type.startswith('school_') and row[code_column] == '99999':
            continue
        areas[row['GEO_ID']] = {
            'state_code': row['STUSAB'], 'state_fips': row['STATE'],
            'area_type': area_type, 'geo_code': row[code_column],
            'name': row['NAME'], 'estimate_year': 2024,
            'source_url': POPULATION,
        }
    seen = set()
    for row in rows(POPULATION, '|'):
        area = areas.get(row['GEO_ID'])
        if not area or row['GEO_ID'] in seen:
            continue
        population = int(row['B01003_E001']) if row['B01003_E001'].isdigit() else 0
        if population > 0:
            area['population'] = population
            seen.add(row['GEO_ID'])
    output = [areas[key] for key in seen]
    output.sort(key=lambda item: (item['state_fips'], item['area_type'], item['geo_code']))
    with open(sys.argv[1], 'w', encoding='utf-8') as dest:
        json.dump(output, dest, ensure_ascii=False, separators=(',', ':'))
    print(f'Prepared {len(output)} areas from 2024 Census ACS: {sys.argv[1]}')


if __name__ == '__main__':
    main()
