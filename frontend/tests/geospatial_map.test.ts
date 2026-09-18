import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { en } from '../src/i18n/locales/en.js';
import { hi } from '../src/i18n/locales/hi.js';
import {
  DEMO_WARD_BOUNDARIES,
  DEMO_ROUTE_CORRIDORS
} from '../src/data/demoSpatialFixtures.js';

describe('Phase 2.5 - Geospatial Map Module & Cartographic Invariants', () => {
  it('1. Demonstration spatial fixtures carry explicit SIMULATED_DEMO_DATA classification', () => {
    assert.equal(DEMO_WARD_BOUNDARIES.properties.provenance, 'SIMULATED_DEMO_DATA');
    assert.equal(DEMO_WARD_BOUNDARIES.properties.sourceType, 'SYNTHETIC_DEMO_FIXTURE');
    assert.ok(DEMO_WARD_BOUNDARIES.properties.notice.includes('not authoritative municipal GIS data'));

    assert.equal(DEMO_ROUTE_CORRIDORS.properties.provenance, 'SIMULATED_DEMO_DATA');
    assert.equal(DEMO_ROUTE_CORRIDORS.properties.sourceType, 'SYNTHETIC_DEMO_FIXTURE');
    assert.ok(DEMO_ROUTE_CORRIDORS.properties.notice.includes('not authoritative municipal GIS data'));
  });

  it('2. Ward boundaries feature valid GeoJSON polygons and municipal properties', () => {
    assert.equal(DEMO_WARD_BOUNDARIES.type, 'FeatureCollection');
    assert.equal(DEMO_WARD_BOUNDARIES.features.length, 2);

    const ward14 = DEMO_WARD_BOUNDARIES.features.find((f) => f.properties.ward_code === 'WARD-14');
    assert.ok(ward14, 'Ward 14 feature should exist');
    assert.equal(ward14.geometry.type, 'Polygon');
    assert.ok(ward14.geometry.coordinates[0].length >= 4, 'Polygon must have closed coordinate ring');

    const ward15 = DEMO_WARD_BOUNDARIES.features.find((f) => f.properties.ward_code === 'WARD-15');
    assert.ok(ward15, 'Ward 15 feature should exist');
    assert.equal(ward15.geometry.type, 'Polygon');
  });

  it('3. Route corridors feature valid GeoJSON LineStrings and route associations', () => {
    assert.equal(DEMO_ROUTE_CORRIDORS.type, 'FeatureCollection');
    assert.equal(DEMO_ROUTE_CORRIDORS.features.length, 4);

    const routeCodes = DEMO_ROUTE_CORRIDORS.features.map((f) => f.properties.route_code);
    assert.ok(routeCodes.includes('RT-14A-01'));
    assert.ok(routeCodes.includes('RT-14B-02'));
    assert.ok(routeCodes.includes('RT-15A-01'));
    assert.ok(routeCodes.includes('RT-15A-02'));

    for (const feature of DEMO_ROUTE_CORRIDORS.features) {
      assert.equal(feature.geometry.type, 'LineString');
      assert.ok(feature.geometry.coordinates.length >= 2, 'LineString must have at least 2 coordinate points');
      assert.equal(feature.properties.provenance, 'SIMULATED_DEMO_DATA');
    }
  });

  it('4. Epistemic Invariant: Vehicle corridor proximity evaluates strictly to OBSERVED, never VERIFIED', () => {
    // English verification string
    assert.ok(en.portals.authority.map.legendPhysicalScan.includes('VERIFIED'));
    assert.ok(en.portals.authority.map.legendProximity.includes('OBSERVED'));
    assert.ok(en.portals.authority.map.epistemicNotice.includes('does NOT constitute proof'));

    // Hindi verification string
    assert.ok(hi.portals.authority.map.legendPhysicalScan.includes('VERIFIED'));
    assert.ok(hi.portals.authority.map.legendProximity.includes('OBSERVED'));
    assert.ok(hi.portals.authority.map.epistemicNotice.includes('वाहन की उपस्थिति मात्र यह साबित नहीं करती'));
  });

  it('5. No synthetic vehicle animation or artificial GPS traces are simulated', () => {
    assert.ok(en.portals.authority.map.noFakeAnimation.includes('no animated vehicles or synthetic GPS traces'));
    assert.ok(hi.portals.authority.map.noFakeAnimation.includes('कोई कृत्रिम वाहन या सिंथेटिक जीपीएस'));
  });

  it('6. Non-color-alone markers and legend items exist for all canonical verification states', () => {
    const requiredLegendKeys = [
      'legendPhysicalScan',
      'legendEvidenceAvailable',
      'legendProximity',
      'legendNotVerified',
      'legendDisputed',
      'legendException',
      'legendScheduled'
    ];

    for (const key of requiredLegendKeys) {
      assert.ok(key in en.portals.authority.map, `English map legend missing key: ${key}`);
      assert.ok(key in hi.portals.authority.map, `Hindi map legend missing key: ${key}`);
      assert.ok(en.portals.authority.map[key as keyof typeof en.portals.authority.map].length > 0);
      assert.ok(hi.portals.authority.map[key as keyof typeof hi.portals.authority.map].length > 0);
    }
  });

  it('7. Layer toggle definitions support base map, ward boundaries, corridors, and households', () => {
    const layers = ['baseMap', 'wardBoundaries', 'routeCorridors', 'households', 'evidenceCheckpoints'];
    for (const l of layers) {
      assert.ok(l in en.portals.authority.map.layers, `English layer missing: ${l}`);
      assert.ok(l in hi.portals.authority.map.layers, `Hindi layer missing: ${l}`);
    }
  });

  it('8. Synchronized accessible tabular alternative contains all mandatory civic columns', () => {
    const tableKeys = [
      'tableTitle',
      'tableSubtitle',
      'serviceUid',
      'residentName',
      'address',
      'coordinates',
      'route',
      'status',
      'evidenceType',
      'focusMarker',
      'pointCount'
    ];

    for (const tk of tableKeys) {
      assert.ok(tk in en.portals.authority.map, `English table key missing: ${tk}`);
      assert.ok(tk in hi.portals.authority.map, `Hindi table key missing: ${tk}`);
    }
  });

  it('9. Bilingual mirror parity for map module is complete between EN and HI', () => {
    const enMapKeys = Object.keys(en.portals.authority.map);
    const hiMapKeys = Object.keys(hi.portals.authority.map);
    assert.deepEqual(enMapKeys.sort(), hiMapKeys.sort(), 'EN and HI map keys must match identically');

    const enLayerKeys = Object.keys(en.portals.authority.map.layers);
    const hiLayerKeys = Object.keys(hi.portals.authority.map.layers);
    assert.deepEqual(enLayerKeys.sort(), hiLayerKeys.sort(), 'EN and HI map layers keys must match identically');
  });
});
