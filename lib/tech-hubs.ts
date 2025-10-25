// Static list of global tech hubs used for the "opportunity" layer on the coverage map.
// Tier 1 = top-tier global hubs (SF, NYC, London, Berlin, etc.)
// Tier 2 = strong regional hubs (Zurich, Dublin, Toronto, Tel Aviv, etc.)
// Tier 3 = rising / emerging hubs (Warsaw, Lisbon, Bangalore, etc.)

interface TechHub {
  id: string
  name: string
  lat: number
  lng: number
  tier: 1 | 2 | 3
  industries: string[]
  country: string
}

export const TECH_HUBS: readonly TechHub[] = [
  // ── North America ──
  { id: 'san-francisco',   name: 'San Francisco, US', lat: 37.7749, lng: -122.4194, tier: 1, industries: ['AI', 'SaaS', 'Fintech', 'BioTech'], country: 'US' },
  { id: 'new-york',        name: 'New York, US',      lat: 40.7128, lng: -74.0060,  tier: 1, industries: ['Fintech', 'Media', 'SaaS', 'AdTech'], country: 'US' },
  { id: 'seattle',         name: 'Seattle, US',       lat: 47.6062, lng: -122.3321, tier: 1, industries: ['Cloud', 'E-commerce', 'Gaming'], country: 'US' },
  { id: 'austin',          name: 'Austin, US',        lat: 30.2672, lng: -97.7431,  tier: 2, industries: ['SaaS', 'Semiconductors'], country: 'US' },
  { id: 'boston',          name: 'Boston, US',        lat: 42.3601, lng: -71.0589,  tier: 2, industries: ['BioTech', 'EdTech', 'Robotics'], country: 'US' },
  { id: 'los-angeles',     name: 'Los Angeles, US',   lat: 34.0522, lng: -118.2437, tier: 2, industries: ['Entertainment', 'AdTech', 'AR/VR'], country: 'US' },
  { id: 'denver',          name: 'Denver, US',        lat: 39.7392, lng: -104.9903, tier: 3, industries: ['Climate', 'SaaS'], country: 'US' },
  { id: 'toronto',         name: 'Toronto, CA',       lat: 43.6532, lng: -79.3832,  tier: 2, industries: ['AI', 'Fintech'], country: 'CA' },
  { id: 'vancouver',       name: 'Vancouver, CA',     lat: 49.2827, lng: -123.1207, tier: 3, industries: ['Gaming', 'VFX', 'Cleantech'], country: 'CA' },

  // ── Europe ──
  { id: 'london',          name: 'London, UK',        lat: 51.5074, lng: -0.1278,   tier: 1, industries: ['Fintech', 'AI', 'Media'], country: 'GB' },
  { id: 'berlin',          name: 'Berlin, DE',        lat: 52.5200, lng: 13.4050,   tier: 1, industries: ['SaaS', 'Mobility', 'Fintech'], country: 'DE' },
  { id: 'amsterdam',       name: 'Amsterdam, NL',     lat: 52.3676, lng: 4.9041,    tier: 1, industries: ['Fintech', 'Logistics', 'SaaS'], country: 'NL' },
  { id: 'paris',           name: 'Paris, FR',         lat: 48.8566, lng: 2.3522,    tier: 1, industries: ['AI', 'Fintech', 'Luxury'], country: 'FR' },
  { id: 'dublin',          name: 'Dublin, IE',        lat: 53.3498, lng: -6.2603,   tier: 2, industries: ['SaaS', 'Gaming'], country: 'IE' },
  { id: 'zurich',          name: 'Zurich, CH',        lat: 47.3769, lng: 8.5417,    tier: 2, industries: ['Fintech', 'AI', 'BioTech'], country: 'CH' },
  { id: 'stockholm',       name: 'Stockholm, SE',     lat: 59.3293, lng: 18.0686,   tier: 2, industries: ['Gaming', 'Fintech', 'Mobility'], country: 'SE' },
  { id: 'copenhagen',      name: 'Copenhagen, DK',    lat: 55.6761, lng: 12.5683,   tier: 2, industries: ['Cleantech', 'Fintech'], country: 'DK' },
  { id: 'helsinki',        name: 'Helsinki, FI',      lat: 60.1699, lng: 24.9384,   tier: 3, industries: ['Gaming', 'Mobility'], country: 'FI' },
  { id: 'munich',          name: 'Munich, DE',        lat: 48.1351, lng: 11.5820,   tier: 2, industries: ['Automotive', 'SaaS', 'Robotics'], country: 'DE' },
  { id: 'barcelona',       name: 'Barcelona, ES',     lat: 41.3851, lng: 2.1734,    tier: 3, industries: ['SaaS', 'Mobility'], country: 'ES' },
  { id: 'madrid',          name: 'Madrid, ES',        lat: 40.4168, lng: -3.7038,   tier: 3, industries: ['Fintech', 'SaaS'], country: 'ES' },
  { id: 'lisbon',          name: 'Lisbon, PT',        lat: 38.7223, lng: -9.1393,   tier: 3, industries: ['SaaS', 'Fintech'], country: 'PT' },
  { id: 'warsaw',          name: 'Warsaw, PL',        lat: 52.2297, lng: 21.0122,   tier: 3, industries: ['SaaS', 'Gaming'], country: 'PL' },
  { id: 'milan',           name: 'Milan, IT',         lat: 45.4642, lng: 9.1900,    tier: 3, industries: ['Fintech', 'Luxury'], country: 'IT' },

  // ── Middle East / Asia ──
  { id: 'tel-aviv',        name: 'Tel Aviv, IL',      lat: 32.0853, lng: 34.7818,   tier: 1, industries: ['Cybersecurity', 'AI', 'Fintech'], country: 'IL' },
  { id: 'dubai',           name: 'Dubai, AE',         lat: 25.2048, lng: 55.2708,   tier: 2, industries: ['Fintech', 'Logistics'], country: 'AE' },
  { id: 'singapore',       name: 'Singapore, SG',     lat: 1.3521,  lng: 103.8198,  tier: 1, industries: ['Fintech', 'Logistics', 'SaaS'], country: 'SG' },
  { id: 'bangalore',       name: 'Bangalore, IN',     lat: 12.9716, lng: 77.5946,   tier: 1, industries: ['SaaS', 'Fintech', 'AI'], country: 'IN' },
  { id: 'tokyo',           name: 'Tokyo, JP',         lat: 35.6762, lng: 139.6503,  tier: 1, industries: ['Gaming', 'Robotics', 'Fintech'], country: 'JP' },
  { id: 'seoul',           name: 'Seoul, KR',         lat: 37.5665, lng: 126.9780,  tier: 2, industries: ['Gaming', 'Semiconductors'], country: 'KR' },

  // ── Oceania / South America ──
  { id: 'sydney',          name: 'Sydney, AU',        lat: -33.8688, lng: 151.2093, tier: 2, industries: ['Fintech', 'SaaS'], country: 'AU' },
  { id: 'melbourne',       name: 'Melbourne, AU',     lat: -37.8136, lng: 144.9631, tier: 2, industries: ['SaaS', 'Biotech'], country: 'AU' },
  { id: 'sao-paulo',       name: 'S\u00e3o Paulo, BR',lat: -23.5505, lng: -46.6333, tier: 2, industries: ['Fintech', 'SaaS'], country: 'BR' },
]

function getHubById(id: string): TechHub | undefined {
  return TECH_HUBS.find((h) => h.id === id)
}

// Haversine distance in kilometers between two lat/lng points
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

function findNearestHub(lat: number, lng: number, maxKmDistance = 50): TechHub | undefined {
  let best: TechHub | undefined
  let bestDist = Infinity
  for (const hub of TECH_HUBS) {
    const d = haversineKm(lat, lng, hub.lat, hub.lng)
    if (d < bestDist && d <= maxKmDistance) {
      best = hub
      bestDist = d
    }
  }
  return best
}

function distanceToNearestHub(lat: number, lng: number): number {
  let bestDist = Infinity
  for (const hub of TECH_HUBS) {
    const d = haversineKm(lat, lng, hub.lat, hub.lng)
    if (d < bestDist) bestDist = d
  }
  return bestDist
}

export { haversineKm }
