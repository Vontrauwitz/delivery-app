import Constants from 'expo-constants';

// En producción, EXPO_PUBLIC_API_URL siempre manda (se define en el build de EAS).
// En desarrollo, en vez de pedir que cada quien hardcodee su IP de LAN en .env,
// derivamos el host del backend del propio host de Metro/Expo (mismo Mac, mismo
// puerto 4000), así el valor sigue automáticamente la IP actual del Mac sin
// tocar nada cuando el DHCP la cambia. "localhost" es el fallback seguro para
// web y para cuando Expo no expone un hostUri (p.ej. builds standalone).
const BACKEND_PORT = 4000;
const FALLBACK_API_URL = `http://localhost:${BACKEND_PORT}`;

function resolveDevApiUrl() {
  const hostUri = Constants.expoConfig?.hostUri || Constants.expoGoConfig?.hostUri;
  const host = hostUri?.split(':')?.[0];
  if (!host) {
    return FALLBACK_API_URL;
  }
  return `http://${host}:${BACKEND_PORT}`;
}

const API_URL = process.env.EXPO_PUBLIC_API_URL || (__DEV__ ? resolveDevApiUrl() : FALLBACK_API_URL);

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    // Carries the HTTP status so callers can tell "the backend rejected this" (401/403 — a real
    // auth failure) apart from other failures. A request that never reaches the backend at all
    // (offline, backend down) throws before this point and has no `.status` — see auth API docs.
    const error = new Error((data && data.error) || 'Error de red');
    error.status = response.status;
    // Structured extra data for responses the caller needs to branch on programmatically (e.g.
    // a blocked-delete conflict's machine-readable code) rather than string-matching `message` —
    // see backend HttpError. Undefined for every response that never set it, so existing callers
    // that only ever read `.message`/`.status` are unaffected.
    error.details = data && data.details;
    throw error;
  }

  return data;
}

export default request;
