import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import { useTranslation } from '../../i18n/I18nContext';
import { apiClient } from '../../api/client';
import { Panel } from '../ui/Panel';
import { StatusBadge } from '../ui/StatusBadge';
import { Button } from '../ui/Button';
import { DataTable } from '../ui/DataTable';
import { Alert } from '../ui/Alert';
import {
  DEMO_WARD_BOUNDARIES,
  DEMO_ROUTE_CORRIDORS
} from '../../data/demoSpatialFixtures';
import {
  MasterRoute,
  MasterHousehold,
  HouseholdVerificationSynthesis
} from '../../types/operations';
import {
  MapPin,
  Layers,
  Filter,
  Compass,
  AlertCircle
} from 'lucide-react';

export interface HouseholdMapItem extends MasterHousehold {
  verification_status: HouseholdVerificationSynthesis['status'];
  evidence_count: number;
  has_grievance: boolean;
}

export const AuthorityGeospatialMap: React.FC = () => {
  const { t } = useTranslation();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const wardLayerRef = useRef<L.GeoJSON | null>(null);
  const corridorLayerRef = useRef<L.GeoJSON | null>(null);
  const markerLookupRef = useRef<Map<string, L.Marker>>(new Map());

  // Component states
  const [routes, setRoutes] = useState<MasterRoute[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string>('ALL');
  const [households, setHouseholds] = useState<HouseholdMapItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedHouseholdId, setSelectedHouseholdId] = useState<string | null>(null);

  // Layer toggles
  const [showWardBoundaries, setShowWardBoundaries] = useState<boolean>(true);
  const [showCorridors, setShowCorridors] = useState<boolean>(true);
  const [showHouseholds, setShowHouseholds] = useState<boolean>(true);

  // 1. Fetch routes and households data
  useEffect(() => {
    let isMounted = true;

    async function loadMapData() {
      try {
        setLoading(true);
        setError(null);

        // Fetch routes
        const routesData = await apiClient.get<MasterRoute[]>('/master/routes');
        if (!isMounted) return;
        setRoutes(routesData);

        // Fetch households
        const householdsData = await apiClient.get<MasterHousehold[]>('/master/households');
        if (!isMounted) return;

        // Fetch verification statuses for households (mapped against demo runs)
        // Run-demo-01 is for Route A (route-demo-A), Run-demo-02 is for Route B, Run-demo-03 for Route C
        const runMap: Record<string, string> = {
          'route-demo-A': 'run-demo-01',
          'route-demo-B': 'run-demo-02',
          'route-demo-C': 'run-demo-03'
        };

        const enrichedHouseholds: HouseholdMapItem[] = await Promise.all(
          householdsData.map(async (hh) => {
            const runId = runMap[hh.route_id];
            let status: HouseholdVerificationSynthesis['status'] = 'EXPECTED';
            let evidenceCount = 0;
            let hasGrievance = false;

            if (runId) {
              try {
                const synth = await apiClient.get<HouseholdVerificationSynthesis>(
                  `/operations/runs/${runId}/households/${hh.id}/status`
                );
                status = synth.status;
                evidenceCount = synth.evidence_count || 0;
                hasGrievance = synth.has_grievance || false;
              } catch {
                // If synthesis endpoint is unavailable, fallback to EXPECTED
                status = 'EXPECTED';
              }
            }

            return {
              ...hh,
              verification_status: status,
              evidence_count: evidenceCount,
              has_grievance: hasGrievance
            };
          })
        );

        if (!isMounted) return;
        setHouseholds(enrichedHouseholds);
      } catch (err: any) {
        if (!isMounted) return;
        console.error('Failed to load geospatial map data:', err);
        setError(err.message || 'Failed to initialize cartographic data');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadMapData();

    return () => {
      isMounted = false;
    };
  }, []);

  // Filtered households based on selected route
  const filteredHouseholds = useMemo(() => {
    if (selectedRouteId === 'ALL') {
      return households;
    }
    return households.filter((h) => h.route_id === selectedRouteId);
  }, [households, selectedRouteId]);

  // 2. Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      // Create map centered on Delhi demonstration coordinates
      const map = L.map(mapContainerRef.current, {
        center: [28.6185, 77.2150],
        zoom: 14,
        zoomControl: true,
        attributionControl: true
      });

      // Standard OSM Tile Layer with strict municipal provenance
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
      }).addTo(map);

      // Create Layer Groups
      markersLayerRef.current = L.layerGroup().addTo(map);

      mapInstanceRef.current = map;
    }

    return () => {
      // Leaflet cleanup on unmount
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Helper function to create status-specific DivIcon (Color + Icon + Label)
  const createMarkerIcon = (status: HouseholdVerificationSynthesis['status']) => {
    let iconChar = '•';
    let bgColor = '#6b7280'; // gray (EXPECTED)
    let borderColor = '#374151';

    switch (status) {
      case 'VERIFIED':
        bgColor = '#16a34a'; // green
        borderColor = '#14532d';
        iconChar = '✓';
        break;
      case 'OBSERVED':
        bgColor = '#2563eb'; // blue
        borderColor = '#1e3a8a';
        iconChar = '👁';
        break;
      case 'EVIDENCE_AVAILABLE':
        bgColor = '#0891b2'; // cyan
        borderColor = '#164e63';
        iconChar = '📄';
        break;
      case 'NOT_VERIFIED':
        bgColor = '#dc2626'; // red
        borderColor = '#7f1d1d';
        iconChar = '✕';
        break;
      case 'DISPUTED':
        bgColor = '#9333ea'; // purple
        borderColor = '#581c87';
        iconChar = '⚠';
        break;
      case 'EXCEPTION':
        bgColor = '#d97706'; // amber
        borderColor = '#78350f';
        iconChar = '!';
        break;
      case 'EXPECTED':
      default:
        bgColor = '#6b7280'; // gray
        borderColor = '#374151';
        iconChar = '⏱';
        break;
    }

    return L.divIcon({
      className: 'civic-marker-icon',
      html: `
        <div style="
          width: 26px;
          height: 26px;
          background-color: ${bgColor};
          border: 2px solid ${borderColor};
          border-radius: 50%;
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          font-weight: bold;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          cursor: pointer;
        " title="${status}">
          ${iconChar}
        </div>
      `,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
      popupAnchor: [0, -14]
    });
  };

  // 3. Update GeoJSON Boundaries and Corridors
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Manage Ward Layer
    if (wardLayerRef.current) {
      map.removeLayer(wardLayerRef.current);
      wardLayerRef.current = null;
    }

    if (showWardBoundaries) {
      wardLayerRef.current = L.geoJSON(DEMO_WARD_BOUNDARIES as any, {
        style: (feature) => ({
          color: feature?.properties?.color || '#2563eb',
          weight: 2,
          fillColor: feature?.properties?.fillColor || '#3b82f6',
          fillOpacity: 0.12,
          dashArray: '5, 5'
        }),
        onEachFeature: (feature, layer) => {
          layer.bindPopup(`
            <div style="font-size: 12px; line-height: 1.4;">
              <strong style="color: var(--color-primary);">${feature.properties.name}</strong><br/>
              <span>Code: <strong>${feature.properties.ward_code}</strong></span><br/>
              <span style="font-size: 10px; color: #6b7280; font-style: italic;">
                ${feature.properties.notice}
              </span>
            </div>
          `);
        }
      }).addTo(map);
    }

    // Manage Corridor Layer
    if (corridorLayerRef.current) {
      map.removeLayer(corridorLayerRef.current);
      corridorLayerRef.current = null;
    }

    if (showCorridors) {
      // Filter corridors by selected route if applicable
      const filteredCorridors = {
        ...DEMO_ROUTE_CORRIDORS,
        features: selectedRouteId === 'ALL'
          ? DEMO_ROUTE_CORRIDORS.features
          : DEMO_ROUTE_CORRIDORS.features.filter(
              (f) => f.properties.route_id === selectedRouteId
            )
      };

      corridorLayerRef.current = L.geoJSON(filteredCorridors as any, {
        style: (feature) => ({
          color: feature?.properties?.color || '#1d4ed8',
          weight: 5,
          opacity: 0.75,
          lineCap: 'round',
          lineJoin: 'round'
        }),
        onEachFeature: (feature, layer) => {
          layer.bindPopup(`
            <div style="font-size: 12px; line-height: 1.4;">
              <strong>${feature.properties.name}</strong> (${feature.properties.route_code})<br/>
              <span>Corridor Type: ${feature.properties.corridor_type}</span><br/>
              <div style="margin-top: 4px; padding: 4px; background: #eff6ff; border-left: 2px solid #2563eb; font-size: 10px;">
                <strong>Epistemic Invariant:</strong> Vehicle proximity along this corridor indicates <em>OBSERVED</em> telemetry, not verified physical collection.
              </div>
              <span style="font-size: 10px; color: #6b7280; display: block; margin-top: 4px;">
                ${feature.properties.notice}
              </span>
            </div>
          `);
        }
      }).addTo(map);
    }
  }, [showWardBoundaries, showCorridors, selectedRouteId]);

  // 4. Update Household Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !markersLayerRef.current) return;

    // Clear existing markers
    markersLayerRef.current.clearLayers();
    markerLookupRef.current.clear();

    if (!showHouseholds) return;

    const bounds: L.LatLngExpression[] = [];

    filteredHouseholds.forEach((hh) => {
      if (hh.latitude == null || hh.longitude == null) return;

      const latLng: [number, number] = [hh.latitude, hh.longitude];
      bounds.push(latLng);

      const marker = L.marker(latLng, {
        icon: createMarkerIcon(hh.verification_status),
        title: `${hh.service_uid} - ${hh.resident_name}`
      });

      marker.bindPopup(`
        <div style="font-size: 12px; line-height: 1.4; min-width: 180px;">
          <strong style="color: var(--color-primary);">${hh.service_uid}</strong><br/>
          <span>Resident: <strong>${hh.resident_name}</strong></span><br/>
          <span>Address: ${hh.address_line}</span><br/>
          <hr style="margin: 6px 0; border: 0; border-top: 1px solid #e2e8f0;"/>
          <span>Status: <strong>${hh.verification_status}</strong></span><br/>
          <span>Evidence Count: <strong>${hh.evidence_count}</strong></span><br/>
          ${hh.has_grievance ? '<span style="color: #dc2626; font-weight: bold;">⚠ Citizen Grievance Lodged</span><br/>' : ''}
          <span style="font-size: 10px; color: #6b7280; font-family: monospace;">
            Lat: ${hh.latitude.toFixed(5)}, Lng: ${hh.longitude.toFixed(5)}
          </span>
        </div>
      `);

      marker.on('click', () => {
        setSelectedHouseholdId(hh.id);
      });

      marker.addTo(markersLayerRef.current!);
      markerLookupRef.current.set(hh.id, marker);
    });

    // If we have markers and a specific route was selected, fit bounds
    if (bounds.length > 0 && selectedRouteId !== 'ALL') {
      map.fitBounds(L.latLngBounds(bounds), { padding: [30, 30] });
    }
  }, [filteredHouseholds, showHouseholds, selectedRouteId]);

  // Handler for focusing a marker from the tabular alternative
  const handleFocusMarker = (household: HouseholdMapItem) => {
    setSelectedHouseholdId(household.id);
    if (!household.latitude || !household.longitude) return;

    const map = mapInstanceRef.current;
    const marker = markerLookupRef.current.get(household.id);

    if (map) {
      map.setView([household.latitude, household.longitude], 17, { animate: true });
    }
    if (marker) {
      marker.openPopup();
    }
  };

  return (
    <Panel
      title={t('portals.authority.map.title')}
      subtitle={t('portals.authority.map.subtitle')}
      actions={
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Route Filter Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <Filter size={14} style={{ color: 'var(--color-text-muted)' }} aria-hidden="true" />
            <label htmlFor="geo-route-filter" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
              {t('portals.authority.map.filterRoute')}:
            </label>
            <select
              id="geo-route-filter"
              value={selectedRouteId}
              onChange={(e) => setSelectedRouteId(e.target.value)}
              style={{
                fontSize: '0.75rem',
                padding: '0.25rem 0.5rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-text-primary)'
              }}
            >
              <option value="ALL">{t('portals.authority.map.allRoutes')}</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code} - {r.name}
                </option>
              ))}
            </select>
          </div>

          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
            {t('portals.authority.map.pointCount', { count: filteredHouseholds.length })}
          </span>
        </div>
      }
    >
      {/* 1. Legal Provenance, Simulation & Epistemic Audit Disclaimers */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
        <Alert
          type="info"
          title="SIMULATED_DEMO_DATA: Cartographic Reference & Household Locations"
          message={`${t('portals.authority.map.demoNotice')} All boundary polygons, corridors, and household premises coordinates represent seeded demonstration data rather than surveyed municipal GIS data. ${t('portals.authority.map.noFakeAnimation')}`}
        />
        <div
          style={{
            padding: '0.625rem 0.875rem',
            backgroundColor: 'var(--color-surface-subtle)',
            borderLeft: '4px solid var(--color-warning)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.8125rem',
            color: 'var(--color-text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.625rem'
          }}
        >
          <AlertCircle size={18} style={{ color: 'var(--color-warning)', flexShrink: 0 }} aria-hidden="true" />
          <div>
            <strong>Epistemic Invariant:</strong> {t('portals.authority.map.epistemicNotice')}
          </div>
        </div>
      </div>

      {error && <Alert type="error" message={error} />}

      {/* 2. Map Controls & Layer Toggles */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
          marginBottom: '0.75rem',
          padding: '0.5rem 0.75rem',
          backgroundColor: 'var(--color-surface-subtle)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border-subtle)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <Layers size={14} aria-hidden="true" />
            Cartographic Layers:
          </span>

          <label style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.375rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showWardBoundaries}
              onChange={(e) => setShowWardBoundaries(e.target.checked)}
            />
            {t('portals.authority.map.layers.wardBoundaries')}
          </label>

          <label style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.375rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showCorridors}
              onChange={(e) => setShowCorridors(e.target.checked)}
            />
            {t('portals.authority.map.layers.routeCorridors')}
          </label>

          <label style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.375rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showHouseholds}
              onChange={(e) => setShowHouseholds(e.target.checked)}
            />
            {t('portals.authority.map.layers.households')}
          </label>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (mapInstanceRef.current) {
                mapInstanceRef.current.setView([28.6185, 77.2150], 14);
              }
            }}
            style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
          >
            <Compass size={13} aria-hidden="true" />
            Reset Civic Extent
          </Button>
        </div>
      </div>

      {/* 3. The Leaflet Cartographic Viewport */}
      <div
        ref={mapContainerRef}
        className="civic-map-container"
        role="region"
        aria-label="Civic GIS Map Viewport"
      />

      {/* 4. Visual & Accessible Non-Color-Alone Map Legend */}
      <div
        style={{
          marginTop: '1rem',
          padding: '0.875rem',
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)'
        }}
      >
        <h4 style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '0.5rem' }}>
          {t('portals.authority.map.legendTitle')}
        </h4>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '0.75rem',
            fontSize: '0.75rem'
          }}
        >
          {/* VERIFIED */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#16a34a', border: '2px solid #14532d', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 'bold' }}>
              ✓
            </div>
            <div>
              <strong>VERIFIED:</strong> Physical doorstep scan (QR/NFC).
            </div>
          </div>

          {/* EVIDENCE_AVAILABLE */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#0891b2', border: '2px solid #164e63', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 'bold' }}>
              📄
            </div>
            <div>
              <strong>EVIDENCE_AVAILABLE:</strong> Field photo/signature uploaded pending review.
            </div>
          </div>

          {/* OBSERVED */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#2563eb', border: '2px solid #1e3a8a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 'bold' }}>
              👁
            </div>
            <div>
              <strong>OBSERVED:</strong> Vehicle proximity corridor checkpoint.
            </div>
          </div>

          {/* NOT_VERIFIED */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#dc2626', border: '2px solid #7f1d1d', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 'bold' }}>
              ✕
            </div>
            <div>
              <strong>NOT_VERIFIED:</strong> Unserviced scheduled household.
            </div>
          </div>

          {/* DISPUTED */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#9333ea', border: '2px solid #581c87', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 'bold' }}>
              ⚠
            </div>
            <div>
              <strong>DISPUTED:</strong> Citizen grievance lodged against service.
            </div>
          </div>

          {/* EXCEPTION */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#d97706', border: '2px solid #78350f', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 'bold' }}>
              !
            </div>
            <div>
              <strong>EXCEPTION:</strong> Inaccessible / approved operational halt.
            </div>
          </div>

          {/* EXPECTED */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#6b7280', border: '2px solid #374151', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 'bold' }}>
              ⏱
            </div>
            <div>
              <strong>EXPECTED:</strong> Scheduled on roster; awaiting crew arrival.
            </div>
          </div>
        </div>
      </div>

      {/* 5. Synchronized Accessible Tabular Alternative for Keyboard & Screen Readers */}
      <div style={{ marginTop: '1.25rem' }}>
        <div style={{ marginBottom: '0.5rem' }}>
          <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>
            {t('portals.authority.map.tableTitle')}
          </h4>
          <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', margin: '0.125rem 0 0' }}>
            {t('portals.authority.map.tableSubtitle')}
          </p>
        </div>

        <DataTable<HouseholdMapItem>
          data={filteredHouseholds}
          keyExtractor={(hh) => hh.id}
          caption="Synchronized household spatial and verification records"
          emptyMessage="No spatial household records available for the selected filter."
          columns={[
            {
              key: 'service_uid',
              header: t('portals.authority.map.serviceUid'),
              render: (hh) => (
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 600,
                    color: selectedHouseholdId === hh.id ? 'var(--color-primary)' : 'inherit'
                  }}
                >
                  {hh.service_uid}
                </span>
              )
            },
            {
              key: 'resident_name',
              header: t('portals.authority.map.residentName'),
              render: (hh) => <span>{hh.resident_name}</span>
            },
            {
              key: 'address_line',
              header: t('portals.authority.map.address'),
              render: (hh) => (
                <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                  {hh.address_line}
                </span>
              )
            },
            {
              key: 'coordinates',
              header: t('portals.authority.map.coordinates'),
              render: (hh) => (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  {hh.latitude != null && hh.longitude != null
                    ? `${hh.latitude.toFixed(5)}, ${hh.longitude.toFixed(5)}`
                    : 'N/A'}
                </span>
              )
            },
            {
              key: 'status',
              header: t('portals.authority.map.status'),
              render: (hh) => (
                <StatusBadge
                  category="verification"
                  status={hh.verification_status}
                  customLabel={hh.verification_status}
                />
              )
            },
            {
              key: 'evidence',
              header: t('portals.authority.map.evidenceType'),
              render: (hh) => (
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                  {hh.evidence_count > 0 ? `${hh.evidence_count} Record(s)` : 'None'}
                </span>
              )
            },
            {
              key: 'action',
              header: 'Actions',
              render: (hh) => (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleFocusMarker(hh)}
                  style={{ fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                >
                  <MapPin size={12} aria-hidden="true" />
                  {t('portals.authority.map.focusMarker')}
                </Button>
              )
            }
          ]}
        />
      </div>
    </Panel>
  );
};
