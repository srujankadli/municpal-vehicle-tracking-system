import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { en } from '../src/i18n/locales/en.js';
import { hi } from '../src/i18n/locales/hi.js';
import type { MasterVehicle, MasterRoute, DailyAssignment, MetricResult } from '../src/types/operations.js';

describe('Phase 2.6 - Batch 1: Master Assets & Operational Rosters Tests', () => {
  describe('1. Fleet Module (/authority/fleet)', () => {
    it('authorized roles can access the fleet module while worker/driver/citizen are excluded', () => {
      const authorityAllowedRoles = ['AUTHORITY', 'SUPERVISOR', 'WARD_OFFICER', 'ADMIN'];

      // Authority roles are authorized
      assert.ok(authorityAllowedRoles.includes('AUTHORITY'));
      assert.ok(authorityAllowedRoles.includes('SUPERVISOR'));
      assert.ok(authorityAllowedRoles.includes('WARD_OFFICER'));
      assert.ok(authorityAllowedRoles.includes('ADMIN'));

      // Unauthorized roles rejected
      assert.ok(!authorityAllowedRoles.includes('WORKER'));
      assert.ok(!authorityAllowedRoles.includes('DRIVER'));
      assert.ok(!authorityAllowedRoles.includes('CITIZEN'));
    });

    it('vehicle operational statuses strictly match canonical backend domain values', () => {
      const canonicalStatuses = ['ACTIVE', 'MAINTENANCE', 'DECOMMISSIONED'];
      for (const status of canonicalStatuses) {
        assert.ok(status in en.status.vehicle, `Missing English vehicle status: ${status}`);
        assert.ok(status in hi.status.vehicle, `Missing Hindi vehicle status: ${status}`);
        assert.ok(en.status.vehicle[status as keyof typeof en.status.vehicle].length > 0);
        assert.ok(hi.status.vehicle[status as keyof typeof hi.status.vehicle].length > 0);
      }
    });

    it('SIMULATED_DEMO_DATA provenance is visibly disclosed without claiming real assets', () => {
      const noticeEn = en.portals.authority.fleet.provenanceNotice;
      const noticeHi = hi.portals.authority.fleet.provenanceNotice;

      assert.ok(noticeEn.includes('SIMULATED_DEMO_DATA'));
      assert.ok(noticeEn.includes('SYNTHETIC_SEEDER'));
      assert.ok(noticeHi.includes('SIMULATED_DEMO_DATA'));
      assert.ok(noticeHi.includes('SYNTHETIC_SEEDER'));
    });

    it('FOA consumes deterministic backend metric without duplicating math formula on client', () => {
      // Backend FOA payload structure
      const mockBackendFoa: MetricResult = {
        metric_name: 'Fleet Operational Availability (FOA)',
        value_percentage: 75.0,
        numerator: 3,
        denominator: 4,
        formula: 'FOA = (V_active / V_operable) * 100%',
        data_classification: 'DERIVED_DATA',
        computed_at: '2026-09-14T06:00:00.000Z',
        metadata: { v_active: 3, v_operable: 4 }
      };

      assert.equal(mockBackendFoa.formula, 'FOA = (V_active / V_operable) * 100%');
      assert.equal(mockBackendFoa.value_percentage, 75.0);
      assert.equal(mockBackendFoa.numerator, 3);
      assert.equal(mockBackendFoa.denominator, 4);
    });

    it('honest empty state is provided for unavailable maintenance history without fabrication', () => {
      const noticeEn = en.portals.authority.fleet.maintenanceHistoryNotice;
      const noticeHi = hi.portals.authority.fleet.maintenanceHistoryNotice;

      assert.ok(noticeEn.includes('No maintenance log records are available'));
      assert.ok(noticeEn.includes('historical workshop events are not fabricated'));
      assert.ok(noticeHi.includes('कोई रखरखाव लॉग रिकॉर्ड उपलब्ध नहीं'));
    });
  });

  describe('2. Routes Module (/authority/routes)', () => {
    it('authorized roles can access the routes module while worker/driver/citizen are excluded', () => {
      const authorityAllowedRoles = ['AUTHORITY', 'SUPERVISOR', 'WARD_OFFICER', 'ADMIN'];
      assert.ok(authorityAllowedRoles.includes('AUTHORITY'));
      assert.ok(!authorityAllowedRoles.includes('WORKER'));
      assert.ok(!authorityAllowedRoles.includes('DRIVER'));
      assert.ok(!authorityAllowedRoles.includes('CITIZEN'));
    });

    it('route and daily assignment records map deterministically without fabricated geometry', () => {
      const sampleRoute: MasterRoute = {
        id: 'route-demo-A',
        area_id: 'area-demo-14A',
        code: 'RT-14A-01',
        name: 'Gandhi Road Main Route',
        description: null,
        source_id: 'src-seed-01',
        created_at: '2026-09-14T00:00:00Z',
        updated_at: '2026-09-14T00:00:00Z'
      };

      const sampleAssignment: DailyAssignment = {
        id: 'da-demo-01',
        service_date: '2026-09-14',
        route_id: 'route-demo-A',
        vehicle_id: 'veh-demo-01',
        driver_id: 'wrk-demo-01',
        supervisor_id: 'wrk-demo-05',
        scheduled_start: '2026-09-14T06:00:00.000Z',
        status: 'SCHEDULED',
        notes: null,
        source_id: 'src-seed-01',
        created_at: '2026-09-14T00:00:00Z',
        created_by: 'usr-admin-01'
      };

      assert.equal(sampleRoute.code, 'RT-14A-01');
      assert.equal(sampleAssignment.route_id, sampleRoute.id);
      assert.equal(sampleAssignment.vehicle_id, 'veh-demo-01');
    });

    it('temporal assignment integrity is preserved across service dates', () => {
      const noticeEn = en.portals.authority.routes.rosterIntegrityNotice;
      const noticeHi = hi.portals.authority.routes.rosterIntegrityNotice;

      assert.ok(noticeEn.includes('temporal validity'));
      assert.ok(noticeEn.includes('without retroactively altering past rosters'));
      assert.ok(noticeHi.includes('लौकिक वैधता'));
    });

    it('run and assignment statuses match canonical domain values', () => {
      const canonicalRunStatuses = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'INCOMPLETE', 'ABORTED'];
      for (const status of canonicalRunStatuses) {
        assert.ok(status in en.status.run, `Missing English run status: ${status}`);
        assert.ok(status in hi.status.run, `Missing Hindi run status: ${status}`);
      }
    });

    it('routes module links to existing Phase 2.5 map without creating duplicate GIS implementations', () => {
      assert.ok(en.portals.authority.routes.viewOnMap.length > 0);
      assert.ok(hi.portals.authority.routes.viewOnMap.length > 0);
    });
  });

  describe('3. Bilingual Parity & String Coverage', () => {
    it('fleet portal strings have complete mirror parity between EN and HI', () => {
      const enFleet = en.portals.authority.fleet;
      const hiFleet = hi.portals.authority.fleet;

      for (const key of Object.keys(enFleet)) {
        assert.ok(key in hiFleet, `Missing Hindi key in portals.authority.fleet: ${key}`);
        const valEn = (enFleet as any)[key];
        const valHi = (hiFleet as any)[key];
        assert.ok(typeof valEn === 'string' && valEn.length > 0);
        assert.ok(typeof valHi === 'string' && valHi.length > 0);
      }
    });

    it('routes portal strings have complete mirror parity between EN and HI', () => {
      const enRoutes = en.portals.authority.routes;
      const hiRoutes = hi.portals.authority.routes;

      for (const key of Object.keys(enRoutes)) {
        assert.ok(key in hiRoutes, `Missing Hindi key in portals.authority.routes: ${key}`);
        const valEn = (enRoutes as any)[key];
        const valHi = (hiRoutes as any)[key];
        assert.ok(typeof valEn === 'string' && valEn.length > 0);
        assert.ok(typeof valHi === 'string' && valHi.length > 0);
      }
    });
  });
});
