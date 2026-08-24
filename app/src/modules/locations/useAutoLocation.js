import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as locationsApi from './api';

// Keep comfortably under the backend's 5-minute staleness threshold (LOCATION_STALE_THRESHOLD_MS)
// so the manager's live map rarely shows this driver as stale while the app is open.
const REFRESH_INTERVAL_MS = 4 * 60 * 1000;

function getPositionWeb() {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(Object.assign(new Error('unavailable'), { unavailable: true }));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos.coords),
      (err) => reject(Object.assign(err, { denied: err.code === 1 })),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

async function getPositionNative() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw Object.assign(new Error('denied'), { denied: true });
  }
  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return position.coords;
}

// Requests location automatically (no manual "share location" button) and re-sends it on an
// interval while this hook is mounted. Never blocks any operational flow — a denial or an
// unavailable device just shows as a compact status, nothing else in the app depends on it.
export function useAutoLocation(token) {
  const [status, setStatus] = useState('requesting'); // requesting | granted | denied | unavailable
  const [lastSentAt, setLastSentAt] = useState(null);
  const intervalRef = useRef(null);

  const ping = useCallback(async () => {
    // Never ping without an authenticated driver — this hook must not run (or appear to
    // succeed) for an unauthenticated session, and must not be mistaken for a sign of
    // successful login.
    if (!token) {
      setStatus('requesting');
      return;
    }
    try {
      const coords = Platform.OS === 'web' ? await getPositionWeb() : await getPositionNative();
      await locationsApi.recordLocation(token, {
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy,
      });
      setStatus('granted');
      setLastSentAt(Date.now());
    } catch (err) {
      setStatus(err?.denied ? 'denied' : 'unavailable');
    }
  }, [token]);

  useEffect(() => {
    if (!token) return undefined;
    ping();
    intervalRef.current = setInterval(ping, REFRESH_INTERVAL_MS);
    return () => clearInterval(intervalRef.current);
  }, [ping, token]);

  return { status, lastSentAt, refresh: ping };
}
