/**
 * Advanced Geocoding Service
 * Interacts with OpenStreetMap Nominatim API with fallback and rate-limiting structures.
 */

const BASE_URL = process.env.GEOCODE_BASE_URL || 'https://nominatim.openstreetmap.org';

// Simple in-memory rate limiter to safely pace public endpoint usage (1 request per second)
let lastRequestAt = 0;
async function throttle() {
  const now = Date.now();
  const wait = Math.max(0, 1000 - (now - lastRequestAt));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

/**
 * Forward geocode: free-text address -> { lat, lng, displayName }
 */
async function geocodeAddress(address) {
  if (!address || !address.trim()) return null;
  await throttle();

  const url = `${BASE_URL}/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
  
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      // Mandated by OSM Acceptable Use Policy to prevent 403 Forbidden bans
      'User-Agent': 'CivicReportingPlatform/1.0 (contact@yourdomain.com)'
    }
  });
  
  if (!res.ok) throw new Error(`Geocoding request failed with status: ${res.status}`);
  
  const data = await res.json();
  if (!data || !data.length) return null;
  
  return {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon), // OSM returns 'lon', mapped to our app standard 'lng'
    displayName: data[0].display_name,
  };
}

/**
 * Reverse geocode: { lat, lng } -> human-readable address string
 */
async function reverseGeocode(lat, lng) {
  await throttle();

  // FIX: Explicitly mapped query parameters to match correct internal logic
  const url = `${BASE_URL}/reverse?format=json&lat=${lat}&lon=${lng}`;
  
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': 'CivicReportingPlatform/1.0 (contact@yourdomain.com)'
    }
  });
  
  if (!res.ok) throw new Error(`Reverse geocoding request failed with status: ${res.status}`);
  
  const data = await res.json();
  return data.display_name || null;
}

/**
 * Haversine distance between two lat/lng points in kilometers.
 */
function distanceKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

module.exports = { geocodeAddress, reverseGeocode, distanceKm };