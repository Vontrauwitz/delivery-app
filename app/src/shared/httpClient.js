// Para probar en un dispositivo físico o emulador, cambia esta URL por defecto
// o define EXPO_PUBLIC_API_URL con la IP de tu máquina en la red local
// (ej. http://192.168.1.10:4000). "localhost" solo funciona en web/simulador.
const DEFAULT_API_URL = 'http://localhost:4000';

const API_URL = process.env.EXPO_PUBLIC_API_URL || DEFAULT_API_URL;

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
    throw new Error((data && data.error) || 'Error de red');
  }

  return data;
}

export default request;
