import { formatDistanceToNow, format } from 'date-fns'

export function parseDate(dateValue) {
  if (!dateValue) return null
  if (dateValue instanceof Date) return isNaN(dateValue.getTime()) ? null : dateValue
  if (typeof dateValue === 'number') {
    return new Date(dateValue < 10000000000 ? dateValue * 1000 : dateValue)
  }
  if (typeof dateValue === 'string') {
    let str = dateValue.trim()
    // If it's an ISO date string without a timezone indicator (e.g. "2026-09-25T05:04:15" or "2026-09-25 05:04:15")
    // Database timestamps stored in UTC must be parsed as UTC
    if (!str.endsWith('Z') && !/[+-]\d{2}(?::?\d{2})?$/.test(str)) {
      str = str.replace(' ', 'T') + 'Z'
    }
    const d = new Date(str)
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

export function formatDate(dateString) {
  const date = parseDate(dateString)
  if (!date) return '—'
  try {
    return format(date, 'MMM d, yyyy')
  } catch {
    return '—'
  }
}

export function formatDateTime(dateString) {
  const date = parseDate(dateString)
  if (!date) return '—'
  try {
    return format(date, 'MMM d, yyyy h:mm a')
  } catch {
    return '—'
  }
}

export function formatRelativeTime(dateString) {
  const date = parseDate(dateString)
  if (!date) return '—'

  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffInSeconds < 60) {
    return 'just now'
  }
  const diffInMinutes = Math.floor(diffInSeconds / 60)
  if (diffInMinutes < 60) {
    return `${diffInMinutes} minute${diffInMinutes === 1 ? '' : 's'} ago`
  }
  const diffInHours = Math.floor(diffInMinutes / 60)
  if (diffInHours < 24) {
    return `${diffInHours} hour${diffInHours === 1 ? '' : 's'} ago`
  }
  const diffInDays = Math.floor(diffInHours / 24)
  if (diffInDays < 7) {
    return `${diffInDays} day${diffInDays === 1 ? '' : 's'} ago`
  }
  try {
    return format(date, 'MMM d, yyyy')
  } catch {
    return `${diffInDays} days ago`
  }
}

export function getPriorityConfig(priority) {
  const configs = {
    critical: {
      label: 'CRITICAL',
      icon: 'alert-triangle',
      bg: 'bg-rose-500/15',
      border: 'border-rose-500/35',
      text: 'text-rose-400',
      iconColor: 'text-rose-400',
    },
    high: {
      label: 'HIGH',
      icon: 'alert-triangle',
      bg: 'bg-priority-high-bg',
      border: 'border-priority-high-border',
      text: 'text-priority-high-text',
      iconColor: 'text-priority-high-icon',
    },
    medium: {
      label: 'MEDIUM',
      icon: 'alert-circle',
      bg: 'bg-priority-medium-bg',
      border: 'border-priority-medium-border',
      text: 'text-priority-medium-text',
      iconColor: 'text-priority-medium-icon',
    },
    low: {
      label: 'LOW',
      icon: 'info',
      bg: 'bg-priority-low-bg',
      border: 'border-priority-low-border',
      text: 'text-priority-low-text',
      iconColor: 'text-priority-low-icon',
    },
  }
  return configs[priority?.toLowerCase()] || configs.low
}

export function getStatusConfig(status) {
  const s = status?.toLowerCase()?.replace(/\s+/g, '_')
  const configs = {
    pending: { label: 'Pending', icon: 'file-text', bg: 'bg-status-submitted-bg', text: 'text-status-submitted-text', border: 'border-status-submitted-border' },
    submitted: { label: 'Submitted', icon: 'file-text', bg: 'bg-status-submitted-bg', text: 'text-status-submitted-text', border: 'border-status-submitted-border' },
    working: { label: 'In Progress', icon: 'loader', bg: 'bg-status-in_progress-bg', text: 'text-status-in_progress-text', border: 'border-status-in_progress-border' },
    ongoing: { label: 'Ongoing', icon: 'loader', bg: 'bg-status-in_progress-bg', text: 'text-status-in_progress-text', border: 'border-status-in_progress-border' },
    in_progress: { label: 'In Progress', icon: 'loader', bg: 'bg-status-in_progress-bg', text: 'text-status-in_progress-text', border: 'border-status-in_progress-border' },
    assigned: { label: 'Assigned', icon: 'user-check', bg: 'bg-status-assigned-bg', text: 'text-status-assigned-text', border: 'border-status-assigned-border' },
    prioritized: { label: 'Prioritized', icon: 'flag', bg: 'bg-status-prioritized-bg', text: 'text-status-prioritized-text', border: 'border-status-prioritized-border' },
    completed: { label: 'Completed', icon: 'check-circle-2', bg: 'bg-status-resolved-bg', text: 'text-status-resolved-text', border: 'border-status-resolved-border' },
    resolved: { label: 'Resolved', icon: 'check-circle-2', bg: 'bg-status-resolved-bg', text: 'text-status-resolved-text', border: 'border-status-resolved-border' },
    rejected: { label: 'Rejected', icon: 'x-circle', bg: 'bg-status-rejected-bg', text: 'text-status-rejected-text', border: 'border-status-rejected-border' },
  }
  return configs[s] || configs.pending
}

export function getCategoryIcon(categoryName) {
  const icons = {
    pothole: 'road',
    garbage: 'trash-2',
    water_leakage: 'droplets',
    streetlight: 'lamp',
    sewage_overflow: 'alert-triangle',
    traffic_signal: 'traffic-light',
    footpath: 'footprints',
    drainage: 'wind',
  }
  return icons[categoryName] || 'alert-circle'
}

export function getCategoryDisplayName(categoryName) {
  const names = {
    pothole: 'Pothole / Road Damage',
    garbage: 'Garbage / Waste',
    water_leakage: 'Water Leakage',
    streetlight: 'Streetlight Issue',
    sewage_overflow: 'Sewage Overflow',
    traffic_signal: 'Traffic Signal',
    footpath: 'Footpath / Sidewalk',
    drainage: 'Drainage / Waterlogging',
  }
  return names[categoryName] || categoryName
}

export function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

export function truncate(str, length = 100) {
  if (!str) return ''
  if (str.length <= length) return str
  return str.slice(0, length).trim() + '…'
}

export function generateAvatarColor(name) {
  const colors = ['#20877f', '#2c7292', '#856327', '#1c6763']
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

export function getInitials(name) {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function debounce(fn, delay) {
  let timeoutId
  return (...args) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn(...args), delay)
  }
}

export function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
  return num.toString()
}

export function formatErrorMessage(err, fallback = 'An unexpected error occurred') {
  if (!err) return '';
  if (typeof err === 'string') return err;
  
  // If Axios normalized message already exists
  if (err.normalizedMessage) return err.normalizedMessage;
  
  const detail = err.response?.data?.detail !== undefined ? err.response?.data?.detail : err.detail;
  if (typeof detail === 'string') return detail;
  
  if (Array.isArray(detail)) {
    const formatted = detail
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          const field = item.loc ? item.loc[item.loc.length - 1] : '';
          const prefix = field && field !== 'body' && field !== 'query' ? `${field}: ` : '';
          return `${prefix}${item.msg || JSON.stringify(item)}`;
        }
        return String(item);
      })
      .filter(Boolean)
      .join(', ');
    if (formatted) return formatted;
  }
  
  if (detail && typeof detail === 'object') {
    return detail.msg || detail.message || JSON.stringify(detail);
  }
  
  if (err.message && typeof err.message === 'string') {
    return err.message;
  }
  
  return fallback;
}

export function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) {
    return null;
  }
  const R = 6371.0; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180.0;
  const dLon = ((lon2 - lon1) * Math.PI) / 180.0;
  const rLat1 = (lat1 * Math.PI) / 180.0;
  const rLat2 = (lat2 * Math.PI) / 180.0;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function formatNominatimAddress(data, lat, lng) {
  if (!data) return (lat != null && lng != null) ? `Location (${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)})` : '';
  const addr = data.address || {};
  const parts = [];

  const place = data.name || addr.amenity || addr.building || addr.road || addr.pedestrian || addr.footway || addr.path;
  if (place) parts.push(place);

  const locality = addr.suburb || addr.neighbourhood || addr.residential || addr.quarter || addr.village;
  if (locality && !parts.includes(locality)) parts.push(locality);

  const city = addr.city || addr.town || addr.county || addr.city_district || addr.state_district;
  if (city && !parts.includes(city)) parts.push(city);

  if (addr.state && !parts.includes(addr.state)) parts.push(addr.state);

  if (addr.postcode) parts.push(addr.postcode);

  const concise = parts.join(', ');
  return concise || data.display_name || ((lat != null && lng != null) ? `Location (${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)})` : '');
}

/**
 * Robust multi-strategy geocoding search:
 * 1. Backend geocode proxy (/api/geocode/search)
 * 2. Photon by Komoot (CORS-enabled OSM GeoJSON, no rate-limit blocks)
 * 3. Direct Nominatim fallback
 */
export async function fetchGeocodeLocations(query, limit = 5) {
  if (!query || query.trim().length < 2) return [];
  const clean = query.trim();

  // Strategy 1: Backend proxy (/api/geocode/search)
  try {
    const { geocodeAPI } = await import('../services/api');
    const res = await geocodeAPI.search(clean, limit);
    if (Array.isArray(res.data) && res.data.length > 0) {
      return res.data;
    }
  } catch (backendErr) {
    console.warn('Backend geocode proxy unavailable or error, falling back to Photon:', backendErr);
  }

  // Strategy 2: Photon by Komoot (Free, CORS-enabled, OpenStreetMap GeoJSON, NO 403s)
  try {
    const photonRes = await fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(clean)}&limit=${limit}`
    );
    if (photonRes.ok) {
      const geo = await photonRes.json();
      if (geo && Array.isArray(geo.features) && geo.features.length > 0) {
        return geo.features.map((feat) => {
          const coords = feat.geometry?.coordinates || [0, 0];
          const props = feat.properties || {};
          const lon = coords[0];
          const lat = coords[1];
          const parts = [props.name, props.street, props.district || props.city, props.state, props.postcode, props.country].filter(Boolean);
          return {
            place_id: props.osm_id || Math.random(),
            lat: String(lat),
            lon: String(lon),
            display_name: parts.join(', ') || props.name || clean,
            name: props.name || props.city,
            address: {
              road: props.street,
              city: props.city,
              state: props.state,
              postcode: props.postcode,
              country: props.country,
            }
          };
        });
      }
    }
  } catch (photonErr) {
    console.warn('Photon geocoding fallback failed:', photonErr);
  }

  // Strategy 3: Direct Nominatim (in case user agent is accepted)
  try {
    const osmRes = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(clean)}&format=jsonv2&addressdetails=1&limit=${limit}`,
      { headers: { Accept: 'application/json' } }
    );
    if (osmRes.ok) {
      const data = await osmRes.json();
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch (osmErr) {
    console.warn('Direct Nominatim fallback failed:', osmErr);
  }

  return [];
}

/**
 * Robust multi-strategy reverse geocode:
 * 1. Backend reverse proxy (/api/geocode/reverse)
 * 2. Photon reverse geocode
 */
export async function fetchReverseGeocode(lat, lon) {
  if (lat == null || lon == null) return null;

  // Strategy 1: Backend proxy (/api/geocode/reverse)
  try {
    const { geocodeAPI } = await import('../services/api');
    const res = await geocodeAPI.reverse(lat, lon);
    if (res.data && (res.data.display_name || res.data.address)) {
      return res.data;
    }
  } catch (backendErr) {
    console.warn('Backend reverse proxy unavailable, falling back:', backendErr);
  }

  // Strategy 2: Photon reverse (/reverse?lat=...&lon=...)
  try {
    const photonRes = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}`);
    if (photonRes.ok) {
      const geo = await photonRes.json();
      if (geo && Array.isArray(geo.features) && geo.features.length > 0) {
        const feat = geo.features[0];
        const props = feat.properties || {};
        const parts = [props.name, props.street, props.district || props.city, props.state, props.postcode, props.country].filter(Boolean);
        return {
          display_name: parts.join(', ') || `Location (${Number(lat).toFixed(5)}, ${Number(lon).toFixed(5)})`,
          name: props.name || props.city,
          address: {
            road: props.street,
            city: props.city,
            state: props.state,
            postcode: props.postcode,
            country: props.country,
          }
        };
      }
    }
  } catch (photonErr) {
    console.warn('Photon reverse geocode failed:', photonErr);
  }

  return {
    display_name: `Location (${Number(lat).toFixed(5)}, ${Number(lon).toFixed(5)})`,
    address: {}
  };
}
