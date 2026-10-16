import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  Navigation, 
  RotateCcw, 
  MapPin, 
  X, 
  Maximize2, 
  Minimize2, 
  Search, 
  Loader2, 
  Check, 
  Sparkles 
} from 'lucide-react';
import { geocodeAPI } from '../services/api';
import { fetchGeocodeLocations, fetchReverseGeocode } from '../utils/helpers';

// Default to center of India
const INDIA_CENTER = [20.5937, 78.9629];
const INDIA_DEFAULT_ZOOM = 5;

// Precision vector pin icon
// SVG box is 36x46. The bottom needle point is strictly at coordinate (18, 46).
// iconAnchor: [18, 46] aligns the bottom needle tip directly with the clicked lat/lng.
const customPinIcon = L.divIcon({
  className: 'custom-map-pin bg-transparent border-0',
  html: `
    <div style="position: relative; width: 36px; height: 46px; pointer-events: none;">
      <svg width="36" height="46" viewBox="0 0 36 46" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 3px 6px rgba(0,0,0,0.45));">
        <!-- Outer Pin Frame -->
        <path d="M18 0C8.05888 0 0 8.05888 0 18C0 31.5 18 46 18 46C18 46 36 31.5 36 18C36 8.05888 27.9411 0 18 0Z" fill="#DC2626"/>
        <!-- Inner Red Gradient -->
        <path d="M18 2C9.16344 2 2 9.16344 2 18C2 29.5 18 43 18 43C18 43 34 29.5 34 18C34 9.16344 26.8366 2 18 2Z" fill="#EF4444"/>
        <!-- Target Ring & Needle Center -->
        <circle cx="18" cy="17" r="7" fill="white"/>
        <circle cx="18" cy="17" r="3.5" fill="#B91C1C"/>
      </svg>
      <!-- Base Ground Contact Indicator -->
      <div style="position: absolute; bottom: -2px; left: 50%; transform: translateX(-50%); width: 8px; height: 3px; background: rgba(0,0,0,0.4); border-radius: 50%; filter: blur(0.8px);"></div>
    </div>
  `,
  iconSize: [36, 46],
  iconAnchor: [18, 46],
  popupAnchor: [0, -46],
});

// Format address components from Nominatim into a clean, human-readable address
function formatNominatimAddress(data, lat, lng) {
  if (!data) return `Location (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
  const addr = data.address || {};
  const parts = [];

  // Street, landmark, building, or road
  const place = data.name || addr.amenity || addr.building || addr.road || addr.pedestrian || addr.footway || addr.path;
  if (place) parts.push(place);

  // Suburb, neighborhood, or locality
  const locality = addr.suburb || addr.neighbourhood || addr.residential || addr.quarter || addr.village;
  if (locality && !parts.includes(locality)) parts.push(locality);

  // City, town, or district
  const city = addr.city || addr.town || addr.county || addr.city_district || addr.state_district;
  if (city && !parts.includes(city)) parts.push(city);

  // State
  if (addr.state && !parts.includes(addr.state)) parts.push(addr.state);

  // Pincode / Postal code
  if (addr.postcode) parts.push(addr.postcode);

  const concise = parts.join(', ');
  return concise || data.display_name || `Location (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
}

// Controller component: handles map resize/invalidateSize without altering selected coordinates
function MapController({ targetPos, zoom, isMaximized }) {
  const map = useMap();

  // Invalidate map projection whenever container changes size or maximize/minimize toggles
  useEffect(() => {
    map.invalidateSize({ pan: false });
    const t = setTimeout(() => {
      map.invalidateSize({ pan: false });
    }, 200);
    return () => clearTimeout(t);
  }, [map, isMaximized]);

  // Attach ResizeObserver to keep viewport projection accurate on any container dimension changes
  useEffect(() => {
    const container = map.getContainer();
    if (!container || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      map.invalidateSize({ pan: false });
    });
    observer.observe(container);

    return () => observer.disconnect();
  }, [map]);

  // Smooth fly-to when searching or locating
  useEffect(() => {
    if (targetPos) {
      map.flyTo(targetPos, zoom || 15, { duration: 1.2 });
    }
  }, [targetPos, zoom, map]);

  return null;
}

// Map click listener: captures exact clicked geographic coordinates
function LocationMarker({ position, onSelect }) {
  useMapEvents({
    click(e) {
      // e.latlng contains the exact geographic coordinate of the user's click
      onSelect(e.latlng);
    },
  });

  return position ? (
    <Marker
      position={[position.lat, position.lng]}
      icon={customPinIcon}
    />
  ) : null;
}

export function MapPicker({ value, onChange }) {
  // Single source of truth for the selected coordinates
  const [position, setPosition] = useState(
    value?.lat != null && value?.lng != null 
      ? { lat: Number(value.lat), lng: Number(value.lng) } 
      : null
  );

  const [derivedAddress, setDerivedAddress] = useState(value?.address || '');
  const [isDeriving, setIsDeriving] = useState(false);
  const [flyTarget, setFlyTarget] = useState(null);
  const [flyZoom, setFlyZoom] = useState(15);
  const [locating, setLocating] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);


  // Sequence ref and abort controller to prevent race conditions across rapid clicks
  const latestClickIdRef = useRef(0);
  const abortControllerRef = useRef(null);

  // Sync external value changes if provided from parent form
  useEffect(() => {
    if (value?.lat != null && value?.lng != null) {
      const vLat = Number(value.lat);
      const vLng = Number(value.lng);
      if (!position || Math.abs(position.lat - vLat) > 0.00001 || Math.abs(position.lng - vLng) > 0.00001) {
        setPosition({ lat: vLat, lng: vLng });
        setFlyTarget([vLat, vLng]);
        setFlyZoom(16);
      }
    } else if (value?.lat == null && value?.lng == null && position) {
      setPosition(null);
      setDerivedAddress('');
    }
  }, [value?.lat, value?.lng, position]);

  // Synchronize derived address if parent passes it
  useEffect(() => {
    if (value?.address && value.address !== derivedAddress) {
      setDerivedAddress(value.address);
    }
  }, [value?.address]);

  // Primary location selection handler
  const handleSelectPosition = useCallback(async (latlng) => {
    // Increment sequence ID to identify this specific click
    const clickId = ++latestClickIdRef.current;

    // Abort any pending reverse-geocoding request from an earlier click
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // 1. Exact clicked coordinates become the single source of truth immediately
    const exactCoordinates = { lat: latlng.lat, lng: latlng.lng };
    setPosition(exactCoordinates);

    // Notify parent immediately with exact coordinates
    if (onChange) {
      onChange({ lat: exactCoordinates.lat, lng: exactCoordinates.lng, address: derivedAddress });
    }

    // 2. Automatically derive location using exact clicked coordinates
    setIsDeriving(true);
    try {
      const data = await fetchReverseGeocode(exactCoordinates.lat, exactCoordinates.lng);

      // RACE CONDITION CHECK:
      // If a newer click occurred while this request was in-flight, ignore this stale response!
      if (clickId !== latestClickIdRef.current) {
        return;
      }

      const formatted = formatNominatimAddress(data, exactCoordinates.lat, exactCoordinates.lng);
      setDerivedAddress(formatted);
      setIsDeriving(false);

      // Inform parent of both exact coordinates and automatically derived address
      if (onChange) {
        onChange({ lat: exactCoordinates.lat, lng: exactCoordinates.lng, address: formatted });
      }
    } catch (err) {
      // Ignore if canceled or superseded by a newer click
      if (clickId !== latestClickIdRef.current || err.name === 'AbortError') {
        return;
      }
      console.warn('Reverse geocoding error:', err);
      const fallback = `Location (${exactCoordinates.lat.toFixed(5)}, ${exactCoordinates.lng.toFixed(5)})`;
      setDerivedAddress(fallback);
      setIsDeriving(false);

      if (onChange) {
        onChange({ lat: exactCoordinates.lat, lng: exactCoordinates.lng, address: fallback });
      }
    }
  }, [onChange, derivedAddress]);

  const handleClear = (e) => {
    if (e) e.stopPropagation();
    latestClickIdRef.current++;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setPosition(null);
    setDerivedAddress('');
    if (onChange) {
      onChange({ lat: null, lng: null, address: '' });
    }
  };

  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const userLatLng = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        handleSelectPosition(userLatLng);
        setFlyTarget([userLatLng.lat, userLatLng.lng]);
        setFlyZoom(16);
      },
      (err) => {
        setLocating(false);
        alert("Unable to retrieve your location: " + err.message);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Search box state
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchError, setSearchError] = useState('');
  const searchTimeoutRef = useRef(null);
  const searchContainerRef = useRef(null);

  // Click outside to dismiss suggestions dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  const handleResetToIndia = () => {
    setFlyTarget(INDIA_CENTER);
    setFlyZoom(INDIA_DEFAULT_ZOOM);
  };

  // Select suggestion from dropdown
  const handleSelectSuggestion = (item) => {
    const resultLat = parseFloat(item.lat);
    const resultLng = parseFloat(item.lon || item.lng);
    if (isNaN(resultLat) || isNaN(resultLng)) return;

    const latlng = { lat: resultLat, lng: resultLng };
    const formatted = formatNominatimAddress(item, resultLat, resultLng);

    setPosition(latlng);
    setDerivedAddress(formatted);
    setFlyTarget([resultLat, resultLng]);
    setFlyZoom(16);
    setSearchQuery(item.name || item.display_name.split(',')[0]);
    setShowSuggestions(false);
    setSearchError('');

    if (onChange) {
      onChange({ lat: resultLat, lng: resultLng, address: formatted });
    }
  };

  // Debounced input change for live suggestions
  const handleSearchInputChange = (e) => {
    const val = e.target.value;
    setSearchQuery(val);
    setSearchError('');

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (val.trim().length >= 2) {
      searchTimeoutRef.current = setTimeout(async () => {
        try {
          const data = await fetchGeocodeLocations(val.trim(), 5);
          if (Array.isArray(data) && data.length > 0) {
            setSuggestions(data);
            setShowSuggestions(true);
          } else {
            setSuggestions([]);
            setShowSuggestions(false);
          }
        } catch (err) {
          setSuggestions([]);
          setShowSuggestions(false);
        }
      }, 300);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  // Search locality or landmark on Go click or Enter
  const handleSearch = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const q = searchQuery.trim();
    if (!q) return;

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (suggestions.length > 0 && showSuggestions) {
      handleSelectSuggestion(suggestions[0]);
      return;
    }

    setSearching(true);
    setSearchError('');
    setShowSuggestions(false);

    try {
      const data = await fetchGeocodeLocations(q, 5);

      if (Array.isArray(data) && data.length > 0) {
        handleSelectSuggestion(data[0]);
      } else {
        setSearchError(`No location found matching "${q}". Click directly on the map.`);
      }
    } catch (err) {
      console.error('Search error:', err);
      setSearchError(`Could not find "${q}". Click directly on the map.`);
    } finally {
      setSearching(false);
    }
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      handleSearch();
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const initialCenter = position ? [position.lat, position.lng] : INDIA_CENTER;
  const initialZoom = position ? 15 : INDIA_DEFAULT_ZOOM;

  const toggleMaximize = () => {
    setIsMaximized(prev => !prev);
  };

  return (
    <div
      className={
        isMaximized
          ? 'fixed inset-3 md:inset-8 z-[9999] rounded-2xl border border-border bg-surface-card overflow-hidden shadow-2xl flex flex-col'
          : 'relative w-full rounded-xl border border-border bg-surface-card overflow-hidden shadow-sm flex flex-col'
      }
    >
      {/* Map Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 bg-surface-card border-b border-border text-xs text-text-secondary relative z-20">
        <div className="flex items-center gap-2 font-medium text-text-primary">
          <div className="flex items-center gap-1.5">
            <span className="p-1 rounded-md bg-red-500/15 text-red-400 border border-red-500/20">
              <MapPin className="w-3.5 h-3.5 text-red-400" />
            </span>
            <span className="font-semibold text-text-primary">Pinpoint on Map</span>
          </div>

          {position && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary-500/10 text-primary-300 font-mono text-[11px] border border-primary-500/25">
              {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
              <button
                type="button"
                onClick={handleClear}
                title="Clear Pin"
                className="hover:text-red-400 transition-colors ml-1 p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
        </div>

        {/* Search bar inside map toolbar with live autocomplete dropdown */}
        <div ref={searchContainerRef} className="relative flex items-center gap-1.5 flex-1 min-w-[200px] max-w-sm">
          <div className="relative w-full">
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchInputChange}
              onKeyDown={handleSearchKeyDown}
              onFocus={() => {
                if (suggestions.length > 0) setShowSuggestions(true);
              }}
              placeholder="Search area or landmark..."
              className="w-full pl-7 pr-7 py-1 bg-surface-elevated text-text-primary border border-border-strong rounded-md text-xs placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary-500/50"
            />
            <Search className="w-3.5 h-3.5 text-text-muted absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSuggestions([]);
                  setShowSuggestions(false);
                  setSearchError('');
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors p-0.5"
                title="Clear Search"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={handleSearch}
            disabled={searching || !searchQuery.trim()}
            className="px-2.5 py-1 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-400 hover:to-primary-500 disabled:opacity-50 text-white rounded-md text-xs font-medium transition-colors shadow-glow-primary shrink-0"
          >
            {searching ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Go'}
          </button>

          {/* Autocomplete Suggestions Dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div
              onMouseDown={(e) => e.preventDefault()}
              className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-xl bg-surface-card border border-border-strong shadow-2xl overflow-hidden backdrop-blur-xl divide-y divide-border/60 max-h-56 overflow-y-auto"
            >
              <div className="px-2.5 py-1.5 bg-surface-elevated/90 text-[10px] font-semibold text-text-muted uppercase tracking-wider flex items-center justify-between">
                <span>Matching Locations</span>
                <span className="text-primary-400">Click to Pin</span>
              </div>
              {suggestions.map((item, idx) => (
                <button
                  key={item.place_id || idx}
                  type="button"
                  onClick={() => handleSelectSuggestion(item)}
                  className="w-full text-left px-2.5 py-2 hover:bg-surface-hover transition-colors flex items-start gap-2 group"
                >
                  <div className="p-1 rounded bg-primary-500/10 text-primary-400 group-hover:bg-primary-500 group-hover:text-text-inverse transition-colors shrink-0 mt-0.5">
                    <MapPin className="w-3 h-3" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-text-primary text-xs group-hover:text-primary-300 transition-colors truncate">
                      {item.name || item.display_name.split(',')[0]}
                    </p>
                    <p className="text-[10px] text-text-muted truncate">
                      {item.display_name}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Inline Feedback / Error */}
          {searchError && (
            <div className="absolute left-0 right-0 top-full mt-1 z-50 px-2.5 py-1.5 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-[11px] flex items-center justify-between shadow-lg">
              <span className="truncate">{searchError}</span>
              <button
                type="button"
                onClick={() => setSearchError('')}
                className="p-0.5 hover:text-red-300 shrink-0 ml-1"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleLocateMe}
            disabled={locating}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-surface-elevated hover:bg-surface-hover border border-border-strong text-text-primary text-xs font-medium transition-colors disabled:opacity-50"
          >
            <Navigation className={`w-3 h-3 text-primary-400 ${locating ? 'animate-spin' : ''}`} />
            <span>{locating ? 'Locating...' : 'Locate Me'}</span>
          </button>
          
          <button
            type="button"
            onClick={handleResetToIndia}
            title="Reset to India View"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-surface-elevated hover:bg-surface-hover border border-border-strong text-text-secondary hover:text-text-primary text-xs transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            <span className="hidden sm:inline">Reset</span>
          </button>

          {/* Maximize / Minimize toggle */}
          <button
            type="button"
            onClick={toggleMaximize}
            title={isMaximized ? 'Minimize Map' : 'Maximize Map'}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-surface-elevated hover:bg-surface-hover border border-border-strong text-text-secondary hover:text-text-primary text-xs font-medium transition-colors"
          >
            {isMaximized ? (
              <>
                <Minimize2 className="w-3.5 h-3.5 text-primary-400" />
                <span>Minimize</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5 text-primary-400" />
                <span>Maximize</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Automatically derived location banner */}
      {position && (isDeriving || derivedAddress) && (
        <div className="px-3 py-1.5 bg-emerald-950/40 border-b border-emerald-500/20 flex items-center justify-between text-xs text-emerald-300 gap-2">
          <div className="flex items-center gap-1.5 truncate">
            {isDeriving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin shrink-0" />
                <span className="font-medium text-emerald-300 animate-pulse">Automatically deriving location address...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="font-semibold text-emerald-200 shrink-0">Derived Address:</span>
                <span className="truncate text-emerald-100 font-medium" title={derivedAddress}>{derivedAddress}</span>
              </>
            )}
          </div>
          {!isDeriving && (
            <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/20 text-[10px] font-semibold text-emerald-300 border border-emerald-500/30">
              <Check className="w-3 h-3" /> Auto-filled
            </span>
          )}
        </div>
      )}

      {/* Leaflet Map Box */}
      <div className={`w-full relative z-0 ${isMaximized ? 'flex-1 min-h-[450px]' : 'h-80'}`}>
        <MapContainer
          center={initialCenter}
          zoom={initialZoom}
          scrollWheelZoom={true}
          style={{ height: '100%', width: '100%', zIndex: 0 }}
        >
          <MapController
            targetPos={flyTarget}
            zoom={flyZoom}
            isMaximized={isMaximized}
          />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <LocationMarker position={position} onSelect={handleSelectPosition} />
        </MapContainer>

        {/* Overlay instruction tag */}
        {!position && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-surface-card/90 backdrop-blur px-3.5 py-1.5 rounded-full shadow-elevated border border-border-strong text-xs font-medium text-text-primary pointer-events-none z-[400] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
            Click anywhere on the map to pin exact issue location
          </div>
        )}
      </div>

      {/* Maximized view footer bar */}
      {isMaximized && (
        <div className="px-4 py-2 bg-surface border-t border-border flex items-center justify-between text-xs">
          <span className="text-text-secondary">
            {position 
              ? `Pinned at exact coordinates: ${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}` 
              : 'Click map to mark the exact location'}
          </span>
          <button
            type="button"
            onClick={toggleMaximize}
            className="px-3 py-1.5 bg-primary-500 hover:bg-primary-400 text-text-inverse font-medium rounded-lg text-xs transition-colors shadow-sm"
          >
            Confirm & Minimize View
          </button>
        </div>
      )}
    </div>
  );
}
