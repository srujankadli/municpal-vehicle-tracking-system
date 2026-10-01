import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Geospatial Map Response Envelope Unwrapping Invariant Suite', () => {
  // Defensive unwrapper logic as implemented in AuthorityGeospatialMap.tsx
  function unwrapRoutes(data: unknown): any[] {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (typeof data === 'object' && 'routes' in (data as any) && Array.isArray((data as any).routes)) {
      return (data as any).routes;
    }
    return [];
  }

  function unwrapHouseholds(data: unknown): any[] {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (typeof data === 'object' && 'households' in (data as any) && Array.isArray((data as any).households)) {
      return (data as any).households;
    }
    return [];
  }

  it('1. Safely unwraps standard { routes: [...] } JSON envelope returned by /master/routes', () => {
    const rawPayload = {
      routes: [
        { id: 'rt-14a-01', route_code: 'RT-14A-01', name: 'Ward 14 Morning Sector A' },
        { id: 'rt-14b-02', route_code: 'RT-14B-02', name: 'Ward 14 Commercial Sector B' }
      ]
    };

    const routes = unwrapRoutes(rawPayload);
    assert.ok(Array.isArray(routes));
    assert.equal(routes.length, 2);
    assert.equal(routes[0].route_code, 'RT-14A-01');
    assert.equal(routes[1].route_code, 'RT-14B-02');
  });

  it('2. Safely unwraps standard { households: [...] } JSON envelope returned by /master/households', () => {
    const rawPayload = {
      households: [
        { id: 'house-101', address: '123 MG Road', lat: 12.9716, lng: 77.5946 },
        { id: 'house-102', address: '124 MG Road', lat: 12.9718, lng: 77.5948 }
      ]
    };

    const households = unwrapHouseholds(rawPayload);
    assert.ok(Array.isArray(households));
    assert.equal(households.length, 2);
    assert.equal(households[0].id, 'house-101');
  });

  it('3. Backward compatible with bare array payloads if API returns direct arrays', () => {
    const bareRoutes = [{ id: 'rt-01', route_code: 'RT-01' }];
    const bareHouseholds = [{ id: 'h-01', address: 'Main Street' }];

    assert.equal(unwrapRoutes(bareRoutes).length, 1);
    assert.equal(unwrapHouseholds(bareHouseholds).length, 1);
  });

  it('4. Resilient to null, undefined, and empty objects without crashing or throwing', () => {
    assert.deepEqual(unwrapRoutes(null), []);
    assert.deepEqual(unwrapRoutes(undefined), []);
    assert.deepEqual(unwrapRoutes({}), []);
    assert.deepEqual(unwrapRoutes('invalid string'), []);

    assert.deepEqual(unwrapHouseholds(null), []);
    assert.deepEqual(unwrapHouseholds(undefined), []);
    assert.deepEqual(unwrapHouseholds({}), []);
    assert.deepEqual(unwrapHouseholds(12345), []);
  });
});
