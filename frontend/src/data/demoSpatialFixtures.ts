/**
 * Phase 2.5 — Deterministic Demonstration Spatial Fixtures
 * 
 * PROVENANCE NOTICE:
 * Classification: SIMULATED_DEMO_DATA
 * Source Type: SYNTHETIC_DEMO_FIXTURE
 * Notice: Demonstration spatial geometry — not authoritative municipal GIS data.
 * 
 * In strict compliance with PROJECT_SPECIFICATION.md v2.3.0 and Phase 2.5 requirements:
 * The Phase 1 database schema does not store ward boundary polygons or populated route path_geojson.
 * These deterministic fixtures provide visual municipal boundaries and route corridors for testing
 * and demonstration without altering database schemas or misrepresenting demo data as surveyed GIS.
 */

export interface DemoGeoJsonFeature<G = any, P = Record<string, any>> {
  type: 'Feature';
  geometry: G;
  properties: P & {
    provenance: 'SIMULATED_DEMO_DATA';
    sourceType: 'SYNTHETIC_DEMO_FIXTURE';
    notice: string;
  };
}

export interface DemoGeoJsonCollection<G = any, P = Record<string, any>> {
  type: 'FeatureCollection';
  features: DemoGeoJsonFeature<G, P>[];
  properties: {
    provenance: 'SIMULATED_DEMO_DATA';
    sourceType: 'SYNTHETIC_DEMO_FIXTURE';
    notice: string;
  };
}

// 1. Demonstration Ward Boundaries (Polygons)
export const DEMO_WARD_BOUNDARIES: DemoGeoJsonCollection = {
  type: 'FeatureCollection',
  properties: {
    provenance: 'SIMULATED_DEMO_DATA',
    sourceType: 'SYNTHETIC_DEMO_FIXTURE',
    notice: 'Demonstration spatial geometry — not authoritative municipal GIS data.'
  },
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [77.2040, 28.6100],
            [77.2210, 28.6100],
            [77.2210, 28.6260],
            [77.2040, 28.6260],
            [77.2040, 28.6100]
          ]
        ]
      },
      properties: {
        ward_id: 'ward-demo-14',
        ward_code: 'WARD-14',
        name: 'Ward 14 (Central Commercial & Residential)',
        color: '#2563eb',
        fillColor: '#3b82f6',
        provenance: 'SIMULATED_DEMO_DATA',
        sourceType: 'SYNTHETIC_DEMO_FIXTURE',
        notice: 'Demonstration spatial geometry — not authoritative municipal GIS data.'
      }
    },
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [77.2150, 28.6260],
            [77.2320, 28.6260],
            [77.2320, 28.6400],
            [77.2150, 28.6400],
            [77.2150, 28.6260]
          ]
        ]
      },
      properties: {
        ward_id: 'ward-demo-15',
        ward_code: 'WARD-15',
        name: 'Ward 15 (North Residential Sector)',
        color: '#059669',
        fillColor: '#10b981',
        provenance: 'SIMULATED_DEMO_DATA',
        sourceType: 'SYNTHETIC_DEMO_FIXTURE',
        notice: 'Demonstration spatial geometry — not authoritative municipal GIS data.'
      }
    }
  ]
};

// 2. Demonstration Route Corridors (LineStrings)
export const DEMO_ROUTE_CORRIDORS: DemoGeoJsonCollection = {
  type: 'FeatureCollection',
  properties: {
    provenance: 'SIMULATED_DEMO_DATA',
    sourceType: 'SYNTHETIC_DEMO_FIXTURE',
    notice: 'Demonstration spatial geometry — not authoritative municipal GIS data.'
  },
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [77.2090, 28.6139],
          [77.2095, 28.6144],
          [77.2110, 28.6159],
          [77.2125, 28.6174],
          [77.2140, 28.6189],
          [77.2145, 28.6195]
        ]
      },
      properties: {
        route_id: 'route-demo-A',
        route_code: 'RT-14A-01',
        name: 'Gandhi Road Main Route',
        ward_code: 'WARD-14',
        corridor_type: 'PLANNED_DEMONSTRATION_CORRIDOR',
        color: '#1d4ed8',
        provenance: 'SIMULATED_DEMO_DATA',
        sourceType: 'SYNTHETIC_DEMO_FIXTURE',
        notice: 'Demonstration spatial geometry — not authoritative municipal GIS data.'
      }
    },
    {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [77.2150, 28.6200],
          [77.2154, 28.6204],
          [77.2166, 28.6216],
          [77.2178, 28.6228],
          [77.2190, 28.6240],
          [77.2195, 28.6245]
        ]
      },
      properties: {
        route_id: 'route-demo-B',
        route_code: 'RT-14B-02',
        name: 'Station Colony Loop',
        ward_code: 'WARD-14',
        corridor_type: 'PLANNED_DEMONSTRATION_CORRIDOR',
        color: '#d97706',
        provenance: 'SIMULATED_DEMO_DATA',
        sourceType: 'SYNTHETIC_DEMO_FIXTURE',
        notice: 'Demonstration spatial geometry — not authoritative municipal GIS data.'
      }
    },
    {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [77.2200, 28.6300],
          [77.2203, 28.6303],
          [77.2209, 28.6309],
          [77.2215, 28.6315],
          [77.2220, 28.6318]
        ]
      },
      properties: {
        route_id: 'route-demo-C',
        route_code: 'RT-15A-01',
        name: 'Greenfield Avenue',
        ward_code: 'WARD-15',
        corridor_type: 'PLANNED_DEMONSTRATION_CORRIDOR',
        color: '#047857',
        provenance: 'SIMULATED_DEMO_DATA',
        sourceType: 'SYNTHETIC_DEMO_FIXTURE',
        notice: 'Demonstration spatial geometry — not authoritative municipal GIS data.'
      }
    },
    {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [77.2220, 28.6320],
          [77.2228, 28.6326],
          [77.2236, 28.6332],
          [77.2245, 28.6340]
        ]
      },
      properties: {
        route_id: 'route-demo-D',
        route_code: 'RT-15A-02',
        name: 'Lake View Lane',
        ward_code: 'WARD-15',
        corridor_type: 'PLANNED_DEMONSTRATION_CORRIDOR',
        color: '#6b7280',
        provenance: 'SIMULATED_DEMO_DATA',
        sourceType: 'SYNTHETIC_DEMO_FIXTURE',
        notice: 'Demonstration spatial geometry — not authoritative municipal GIS data.'
      }
    }
  ]
};
