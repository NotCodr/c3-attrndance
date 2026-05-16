import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Link } from 'react-router-dom';

// Fix default marker icons in Leaflet + bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const categoryColors = {
  Tech: '#4A90E2',
  Arts: '#A855F7',
  Sports: '#10B981',
  Cultural: '#F59E0B',
  Academic: '#3B82F6',
  Social: '#EC4899',
  Political: '#EF4444',
  Wellness: '#14B8A6',
  Hub: '#0A1628',
  Event: '#4A90E2',
};

function makePinIcon(color, label) {
  return L.divIcon({
    className: 'custom-pin',
    html: `
      <div style="position: relative; display: flex; flex-direction: column; align-items: center;">
        <div style="
          width: 36px; height: 36px;
          background: ${color};
          border: 3px solid white;
          border-radius: 50%;
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
          display: flex; align-items: center; justify-content: center;
          font-size: 16px;
        ">${label}</div>
        <div style="
          width: 0; height: 0;
          border-left: 6px solid transparent;
          border-right: 6px solid transparent;
          border-top: 8px solid white;
          margin-top: -2px;
          filter: drop-shadow(0 2px 2px rgba(0,0,0,0.15));
        "></div>
      </div>
    `,
    iconSize: [36, 44],
    iconAnchor: [18, 44],
    popupAnchor: [0, -42],
  });
}

function FlyTo({ center }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, map.getZoom(), { duration: 0.6 });
  }, [center[0], center[1]]);
  return null;
}

const EMOJI = {
  Tech: '💻',
  Arts: '🎨',
  Sports: '⚽',
  Cultural: '🌏',
  Academic: '📚',
  Social: '🎉',
  Political: '📣',
  Wellness: '🧘',
  Hub: '🏛️',
  Event: '📅',
};

export default function CampusMap({ pins, center, zoom = 16 }) {
  return (
    <MapContainer
      center={center}
      zoom={zoom}
      style={{ height: '100%', width: '100%', borderRadius: 'inherit' }}
      scrollWheelZoom={true}
    >
      <FlyTo center={center} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      {pins.map((pin) => {
        const color = categoryColors[pin.category] || categoryColors.Event;
        const emoji = EMOJI[pin.category] || '📍';
        return (
          <Marker
            key={pin.id}
            position={[pin.lat, pin.lng]}
            icon={makePinIcon(color, emoji)}
          >
            <Popup>
              <div style={{ minWidth: 200 }}>
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color, marginBottom: 4 }}>
                  {pin.kind}
                </div>
                <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontWeight: 700, fontSize: 16, lineHeight: 1.2, marginBottom: 4 }}>
                  {pin.title}
                </div>
                {pin.subtitle && (
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
                    {pin.subtitle}
                  </div>
                )}
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>
                  📍 {pin.location}
                </div>
                {pin.link && (
                  <Link
                    to={pin.link}
                    style={{
                      display: 'inline-block',
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#4A90E2',
                      textDecoration: 'none',
                    }}
                  >
                    View details →
                  </Link>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}

export { categoryColors, EMOJI };