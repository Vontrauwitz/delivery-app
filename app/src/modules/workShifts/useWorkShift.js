import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as workShiftsApi from './api';

// Shared shift state/actions so the driver home screen can drive both the "start shift" hero
// CTA and the compact status chip from the same source, instead of two separate components.
//
// Authentication and WorkShift are two different states — this hook only ever reports what the
// backend currently says about the shift; it never determines whether the driver is logged in.
// A `null` shift (confirmed by a successful response) means "no active shift", which is a normal,
// valid state — it must never be confused with a failed request.
export function useWorkShift(token) {
  const [shift, setShift] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  // loadError: the shift fetch itself failed (network blip, momentary 401/500) — distinct from
  // "confirmed no active shift", and distinct from actionError below so a failed start/end never
  // gets mistaken for a failed load (which would hide the "Iniciar turno" button entirely).
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const appStateRef = useRef(AppState.currentState);

  const load = useCallback(async () => {
    if (!token) {
      setShift(null);
      setLoadError('');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await workShiftsApi.getMyActiveShift(token);
      // A successful response is authoritative, including a `null` body — that genuinely means
      // "no active shift" and must overwrite whatever we had before.
      setShift(data);
      setLoadError('');
    } catch (err) {
      // The request itself failed — this is NOT the same as the backend confirming "no active
      // shift". Keep whatever shift state we last trusted instead of silently flipping to a
      // misleading "sin turno" UI; surface the error so the screen can show a retry instead.
      setLoadError(err.message || 'No se pudo cargar el turno');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  // Whenever the app returns to the foreground, the shift may have changed on the backend while
  // we weren't looking (closed by a manager, expired, backend restarted) — never trust
  // in-memory shift state across a background/foreground transition.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        load();
      }
      appStateRef.current = nextState;
    });
    return () => subscription.remove();
  }, [load]);

  // Belt-and-suspenders for the AppState listener above: an Android app killed and relaunched
  // after a long background never emits a background->active transition to hang a retry off of
  // — it's just a fresh mount whose very first load can land in the same offline window. Poll
  // while stuck in an error so it self-heals without a manual refresh.
  useEffect(() => {
    if (!loadError) {
      return undefined;
    }
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, [loadError, load]);

  async function start() {
    setActionError('');
    setBusy(true);
    try {
      const data = await workShiftsApi.startShift(token);
      setShift(data);
    } catch (err) {
      setActionError(err.message || 'No se pudo iniciar el turno');
    } finally {
      setBusy(false);
    }
  }

  async function end() {
    setActionError('');
    setBusy(true);
    try {
      await workShiftsApi.endShift(token);
      setShift(null);
    } catch (err) {
      setActionError(err.message || 'No se pudo finalizar el turno');
    } finally {
      setBusy(false);
    }
  }

  // Called by any screen whose operational action just failed because the backend reports no
  // active shift (e.g. selling) — the local state must reflect that immediately instead of
  // leaving stale UI that still claims a shift is active.
  function clearShift() {
    setShift(null);
  }

  return { shift, loading, busy, loadError, actionError, start, end, reload: load, clearShift };
}
