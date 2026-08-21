# Delivery App

Estado actual: **Fase 0 y Fase 1** implementadas — backend base, autenticación, usuarios, productos, y el flujo completo de ventas (chofer crea venta → queda PENDING → manager revisa/modifica/aprueba/cancela/marca incidente, con trazabilidad en AuditLog). Ver `PLAN.md` para la arquitectura completa y las fases siguientes.

## Requisitos previos

- Node.js 18+ (probado con Node 26)
- MongoDB corriendo localmente (o una URI de MongoDB accesible)
- Para la app móvil: Expo Go instalado en tu teléfono, o un simulador iOS/Android, o simplemente un navegador (funciona en modo web)

Si no tienes MongoDB instalado, puedes instalarlo con Homebrew:

```bash
brew tap mongodb/brew
brew install mongodb-community@7.0
brew services start mongodb-community@7.0
```

## 1. Backend

### Instalar dependencias

```bash
cd backend
npm install
```

### Configurar variables de entorno

```bash
cp .env.example .env
```

Edita `.env` si tu MongoDB no corre en `mongodb://127.0.0.1:27017`:

```
PORT=4000
MONGO_URI=mongodb://127.0.0.1:27017/delivery-app
JWT_SECRET=change-this-secret
JWT_EXPIRES_IN=7d
```

### Cargar datos de prueba (seed)

Crea 1 manager, 1 driver y 3 productos de ejemplo (borra usuarios y productos existentes antes de crearlos):

```bash
npm run seed
```

### Arrancar el backend

```bash
npm run dev    # con recarga automática (nodemon)
# o
npm start      # sin recarga automática
```

El servidor queda escuchando en `http://localhost:4000`. Puedes verificar que está arriba con:

```bash
curl http://localhost:4000/health
```

## 2. App Expo (móvil / web)

### Instalar dependencias

```bash
cd app
npm install
```

### Configurar variables de entorno

```bash
cp .env.example .env
```

Por defecto la app apunta a `http://localhost:4000`, que funciona si pruebas en un navegador o en un simulador en la misma máquina. Si vas a probar en un **teléfono físico** con Expo Go, cambia `EXPO_PUBLIC_API_URL` en `.env` por la IP de tu computadora en la red local, por ejemplo:

```
EXPO_PUBLIC_API_URL=http://192.168.1.10:4000
```

### Arrancar la app

```bash
npm start
```

Esto abre el menú de Expo Dev Tools. Desde ahí puedes:
- Presionar `w` para abrirla en el navegador.
- Escanear el QR con Expo Go (Android) o la cámara (iOS) para abrirla en tu teléfono.
- Presionar `a` / `i` para abrir un emulador Android / simulador iOS, si los tienes configurados.

## Credenciales de prueba

Creadas por `npm run seed` en el backend:

| Rol | Email | Password |
|---|---|---|
| Manager | `manager@delivery.test` | `123456` |
| Driver | `driver@delivery.test` | `123456` |

Al iniciar sesión, la app redirige automáticamente:
- `driver` → pantalla inicial del chofer (`/driver`)
- `manager` / `admin` → panel administrativo (`/admin`)

## Flujo de ventas (Fase 1)

**Chofer** (`/driver`):
- **Nueva venta** (`/driver/new-sale`): selecciona productos con tarjetas +/-, puede agregar un ajuste (monto + motivo obligatorio si el monto ≠ 0), divide el pago entre efectivo y transferencia, y ve validación en vivo de que los pagos sumen el total. Al registrar, la venta queda `PENDING`.
- **Mis ventas** (`/driver/my-sales`): lista sus ventas con total, estado (Pendiente/Aprobada/Cancelada/Incidente) y fecha.

**Manager** (`/admin`):
- **Ventas pendientes** (`/admin/sales-pending`): lista las ventas en estado `PENDING`.
- **Detalle de venta** (`/admin/sale/[id]`): muestra quién creó la venta y cuándo, permite modificar productos/cantidades/ajuste/pago (recalcula todo y revalida que los pagos cuadren), y permite **Aprobar**, **Cancelar** (motivo obligatorio) o **Marcar incidente** (nota obligatoria). Cada cambio queda registrado abajo en el **Historial de cambios** (AuditLog) con el valor anterior y el nuevo.

Reglas clave ya implementadas en el backend (y reforzadas en el frontend):
- Toda venta de chofer nace `PENDING`; no existe ninguna ruta que la cree ya `APPROVED`.
- La suma de `payments` debe ser exactamente igual al `totalFinal` (validado en cliente y servidor).
- El precio de cada item se toma de `Product.basePrice` en el momento de crear/modificar la venta (el cliente nunca puede enviar un precio manipulado).
- Una venta `CANCELLED` o `APPROVED` ya no puede modificarse.

## Estructura del proyecto

```
delivery-app/
├── PLAN.md        # arquitectura completa y fases de desarrollo
├── backend/        # API REST (Node + Express + Mongoose)
└── app/             # App Expo Router (móvil + web)
```

Ver `PLAN.md` para el detalle de módulos, modelos de datos y fases siguientes. Implementado hasta ahora: `auth`, `users`, `products` (Fase 0) y `sales`, `payments`, `approvals`, `audit` (Fase 1). Inventario, ubicación, mensajería, dispatch y reabastecimiento se implementarán en fases posteriores.
