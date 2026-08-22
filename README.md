# Delivery App

Sistema de gestión operativa para venta ambulante (choferes que venden productos desde un vehículo/carrito) con control administrativo centralizado: aprobación de ventas, control de inventario por vehículo, cierre de caja, reabastecimiento, ubicación en vivo, mensajería y asignación de entregas (dispatch).

Full-stack en JavaScript: **Node.js + Express + MongoDB** en el backend, **Expo Router (React Native + React Native Web)** en el frontend, compartiendo una única base de código para móvil y panel web.

> Este proyecto fue desarrollado con un flujo de trabajo asistido por IA usando [Claude Code](https://claude.com/claude-code) como herramienta de implementación. Las decisiones de arquitectura, reglas de negocio y diseño del producto fueron dirigidas por el desarrollador; Claude Code se usó para acelerar la escritura de código, pruebas y documentación siguiendo esas decisiones.

---

## Tabla de contenido

- [El problema de negocio](#el-problema-de-negocio)
- [Características principales](#características-principales)
- [Arquitectura](#arquitectura)
- [Stack tecnológico](#stack-tecnológico)
- [Roles y flujo de acceso](#roles-y-flujo-de-acceso)
- [Reglas de negocio clave](#reglas-de-negocio-clave)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Puesta en marcha](#puesta-en-marcha)
- [Variables de entorno](#variables-de-entorno)
- [Credenciales de prueba (seed)](#credenciales-de-prueba-seed)
- [Pruebas](#pruebas)
- [Resumen de fases de desarrollo](#resumen-de-fases-de-desarrollo)
- [Limitaciones conocidas y deuda técnica](#limitaciones-conocidas-y-deuda-técnica)
- [Posibles mejoras futuras](#posibles-mejoras-futuras)

---

## El problema de negocio

Un negocio de venta ambulante (agua, refrescos, botanas, etc.) despacha choferes con un vehículo cargado de producto. Sin un sistema, el manager no tiene visibilidad de:

- Qué se vendió, a quién se le cobró y cómo (efectivo vs. transferencia), hasta que el chofer regresa.
- Si el inventario físico del vehículo coincide con lo que debería quedar según las ventas.
- Si el efectivo que el chofer entrega al final del día coincide con lo que debería haber recaudado.
- Dónde están los choferes en un momento dado, o cómo comunicarles una instrucción o una nueva dirección de entrega.

Esta aplicación resuelve ese flujo digitalizando cada paso — desde que el chofer inicia turno hasta que cierra caja — y exige que **toda venta capturada por un chofer sea revisada y aprobada por un manager** antes de darse por válida, sin perder nunca el registro original del movimiento (incluso si se cancela o se marca como incidente).

## Características principales

- **Turnos de trabajo (WorkShift):** el chofer inicia y termina turno manualmente; ninguna venta, conteo o sesión de inventario puede operar sin un turno abierto.
- **Ventas con aprobación obligatoria:** el chofer registra la venta (productos, ajuste con motivo, pago dividido entre efectivo/transferencia); nace en estado `PENDING` y el manager la aprueba, la modifica, la cancela o la marca como incidente — siempre con auditoría de quién cambió qué y cuándo.
- **Inventario por sesión:** cada sesión de inventario vive atada a un vehículo y arranca con un conteo inicial. El inventario esperado se calcula en cada lectura a partir del stock inicial menos las ventas que sí representan salida física de producto.
- **Cierre de caja con conciliación:** el chofer cuenta el inventario físico y reporta el efectivo; el sistema calcula automáticamente la diferencia de efectivo y de inventario contra lo esperado. La sesión queda congelada (`CLOSING_PENDING`) hasta que el manager la revisa y cierra (o la reabre si detecta un problema).
- **Reabastecimiento sugerido:** cálculo de cantidad sugerida por producto/vehículo según consumo histórico, con parámetros configurables (días de cobertura, stock de seguridad) por producto.
- **Conteos semanales con reporte de discrepancias:** auditoría de más baja frecuencia, independiente del cierre diario.
- **Ubicación en vivo:** el chofer comparte su posición periódicamente; el manager ve un mapa de choferes activos con indicador de "ubicación desactualizada" calculado al momento de leer (nunca almacenado como bandera fija).
- **Mensajería manager → chofer:** mensajes libres con estado de leído/no leído.
- **Dispatch (asignación de entregas):** el manager crea tareas de entrega con dirección y enlace directo a mapas; el chofer las acepta y las marca como completadas.

## Arquitectura

Dos partes independientes que se comunican únicamente por API REST:

```
delivery-app/
├── backend/     → Node.js + Express + MongoDB + Mongoose (API REST)
└── app/         → Expo Router (app móvil para choferes + panel web para manager/admin)
```

### Un solo cliente para móvil y panel web

En vez de mantener dos frontends separados, se usa **Expo Router** con su soporte de export web (`react-native-web`). Las mismas pantallas y componentes sirven tanto para el chofer en su teléfono como para el manager en un navegador de escritorio — evita duplicar lógica de UI y mantiene un único lenguaje (JavaScript) en toda la base de código.

### Backend modular por dominio

Cada módulo de negocio (`sales`, `inventory`, `closing`, `dispatch`, etc.) vive en su propia carpeta con sus propias capas (`model`, `service`, `controller`, `routes`, `validation` donde aplica). Un módulo solo puede importar a otro a través de su `*.service.js` — nunca accede directamente al modelo de otro módulo. Reglas de bajo acoplamiento explícitas: `sales` puede usar `inventory` y `audit`, pero no `locations` ni `messaging`; `locations`, `messaging` y `dispatch` no saben nada de `sales`; `replenishment` solo lee de `products`, `sales` e `inventoryCounts`, nunca escribe en ellos.

### Principios de diseño reforzados en todo el código

- **El servidor nunca confía en el cliente para identidad, vehículo o sesión activa.** El chofer autenticado, su vehículo asignado y su sesión de inventario activa siempre se derivan en el backend a partir del JWT — nunca se aceptan como parámetros del cliente.
- **Los valores derivados se calculan al leer, nunca se almacenan.** Ejemplos: si una ubicación está "desactualizada" (`isStale`), el inventario esperado, las diferencias de un conteo. Esto evita que un dato calculado quede desincronizado del estado real.
- **Ningún registro se borra por una acción de negocio.** Cancelar una venta o marcarla como incidente cambia su estado y preserva el motivo — el movimiento original nunca se pierde ni se sobreescribe.

Ver [`PLAN.md`](./PLAN.md) para el documento de planificación original con el detalle completo de modelos de datos y flujos.

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Backend | Node.js, Express, MongoDB, Mongoose |
| Autenticación | JWT (`jsonwebtoken`), hashing de contraseñas (`bcryptjs`) |
| Frontend | Expo Router, React Native, React Native Web |
| Almacenamiento local (app) | `@react-native-async-storage/async-storage` |
| Testing | Suite de pruebas E2E propia sobre `fetch` (sin framework externo) |

## Roles y flujo de acceso

Tres roles: `driver`, `manager`, `admin`. El manager y el admin comparten el mismo panel (`/admin`); el rol `admin` existe para separar permisos administrativos más sensibles en el futuro sin tener que migrar datos.

Al iniciar sesión, la app redirige automáticamente según el rol:
- `driver` → `/driver` (panel del chofer)
- `manager` / `admin` → `/admin` (panel administrativo)

Cada layout de rutas (`app/admin/_layout.js`, `app/driver/_layout.js`) valida el rol del usuario autenticado y redirige si no corresponde — un chofer no puede navegar manualmente a una URL del panel admin, y viceversa.

## Reglas de negocio clave

- **Toda venta creada por un chofer nace `PENDING`.** No existe ninguna ruta de código que cree una venta ya aprobada.
- **La suma de los pagos (`payments`) debe ser exactamente igual al total final de la venta**, validado tanto en el cliente (para feedback inmediato) como en el servidor (fuente de verdad — nunca se confía solo en el cliente).
- **El precio de cada producto vendido se congela al momento de la venta.** Si el precio base de un producto cambia después, las ventas ya creadas no se ven afectadas.
- **Un ajuste al total (`adjustment`) con monto distinto de cero requiere un motivo obligatorio.**
- **Efecto de cada estado de venta sobre inventario y efectivo esperado:**

  | Estado | ¿Descuenta inventario? | ¿Cuenta como efectivo esperado? | Razón |
  |---|---|---|---|
  | `PENDING` | Sí | No | El producto ya salió físicamente del vehículo, pero el manager aún no validó el dinero. |
  | `APPROVED` | Sí | Sí | Venta ya revisada y validada por el manager. |
  | `CANCELLED` | No | No | La operación se anuló realmente; se excluye de ambos cálculos pero el registro nunca se borra. |
  | `INCIDENT` | Sí | No | Hay una anomalía sin resolver; el producto sigue contando como salido, pero el dinero no se da por bueno hasta resolverla. |

- **Una sesión de inventario queda `CLOSING_PENDING` (congelada) en cuanto el chofer envía su cierre**, y solo el manager puede finalizarla (`CLOSED`) o reabrirla (`OPEN`) si detecta un problema.
- **Un vehículo no puede tener dos sesiones de inventario activas a la vez** (`OPEN` o `CLOSING_PENDING` cuentan como activas); debe cerrarse por completo la anterior antes de abrir una nueva.
- **Ninguna operación (venta, conteo, apertura de sesión) puede ejecutarse sin un turno de trabajo (`WorkShift`) abierto para ese chofer.**

## Estructura del proyecto

```
delivery-app/
├── PLAN.md                     # documento de planificación / arquitectura original
├── README.md
├── backend/
│   ├── src/
│   │   ├── server.js           # arranque del servidor
│   │   ├── app.js              # configuración de Express
│   │   ├── config/              # conexión a DB, lectura de env
│   │   ├── middlewares/         # auth (JWT), requireRole, errorHandler
│   │   ├── modules/              # un directorio por dominio de negocio
│   │   │   ├── auth/ users/ products/ vehicles/
│   │   │   ├── sales/ payments/ approvals/ audit/
│   │   │   ├── workShifts/ inventory/ inventoryCounts/ closing/
│   │   │   ├── replenishment/
│   │   │   └── locations/ messaging/ dispatch/
│   │   └── shared/               # constantes de dominio (roles, estados, etc.)
│   ├── test/                     # suite de pruebas E2E + unitarias (ver Pruebas)
│   └── src/seed.js               # datos de prueba
└── app/
    ├── app/                      # rutas de Expo Router
    │   ├── (auth)/login.js
    │   ├── driver/                # pantallas del chofer
    │   └── admin/                 # pantallas del manager/admin
    └── src/
        ├── modules/               # espejo del dominio del backend (api.js + componentes por módulo)
        └── shared/                 # componentes y utilidades compartidas (ScreenHeader, httpClient, constants, money, duration)
```

Cada pantalla en `app/app/**` es delgada: compone componentes de `src/modules/*` y llama a sus funciones de API. La lógica de negocio del lado del cliente (cálculos, validación básica de formularios) vive en `src/modules/*`, nunca en el archivo de ruta — y siempre se repite en el backend, que es la fuente de verdad final.

## Puesta en marcha

### Requisitos previos

- Node.js 18+
- MongoDB corriendo localmente (o una URI de MongoDB accesible)
- Para probar en un teléfono físico: Expo Go instalado, o un simulador iOS/Android — aunque probar en el navegador (modo web) es suficiente para evaluar el proyecto completo, incluido el panel admin

Si no tienes MongoDB instalado, con Homebrew:

```bash
brew tap mongodb/brew
brew install mongodb-community@7.0
brew services start mongodb-community@7.0
```

O arráncalo manualmente apuntando a un directorio de datos propio:

```bash
mongod --dbpath ~/mongodb-local/data --port 27017
```

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env   # edítalo si tu MongoDB no corre en localhost:27017
npm run seed            # crea usuarios, vehículo y productos de prueba
npm run dev              # arranca con recarga automática (nodemon) en el puerto 4000
```

Verifica que el servidor está arriba:

```bash
curl http://localhost:4000/health
```

### 2. App (Expo)

```bash
cd app
npm install
cp .env.example .env   # por defecto apunta a http://localhost:4000
npm start
```

Desde el menú de Expo Dev Tools:
- Presiona `w` para abrirla en el navegador (recomendado para probar el panel admin).
- Escanea el QR con Expo Go, o presiona `a` / `i` para un emulador/simulador, para probar el lado del chofer en un dispositivo real.

Si pruebas en un **teléfono físico**, cambia `EXPO_PUBLIC_API_URL` en `app/.env` por la IP de tu computadora en la red local (ej. `http://192.168.1.10:4000`), ya que `localhost` en el teléfono apuntaría al propio teléfono.

## Variables de entorno

### `backend/.env`

| Variable | Descripción |
|---|---|
| `PORT` | Puerto donde escucha el servidor Express (default `4000`). |
| `MONGO_URI` | URI de conexión a MongoDB. |
| `JWT_SECRET` | Secreto usado para firmar los tokens JWT. **Cambiar en cualquier entorno real.** |
| `JWT_EXPIRES_IN` | Duración de los tokens emitidos (ej. `7d`). |

### `app/.env`

| Variable | Descripción |
|---|---|
| `EXPO_PUBLIC_API_URL` | URL base del backend que consume la app. |

Ninguno de los dos `.env` está commiteado al repositorio (ver `.gitignore`); solo se versionan los `.env.example` con valores de ejemplo, sin secretos reales.

## Credenciales de prueba (seed)

`npm run seed` (en `backend/`) borra usuarios, productos y vehículos existentes y crea:

| Rol | Email | Password |
|---|---|---|
| Manager | `manager@delivery.test` | `123456` |
| Driver | `driver@delivery.test` | `123456` |

También crea 3 productos de ejemplo y 1 vehículo (`Carrito 1`) asignado al chofer de prueba. Después de sembrar los datos, el chofer debe iniciar turno (`POST /work-shifts/start`, o el botón "Iniciar turno" en el panel) y el manager debe abrir una sesión de inventario para ese vehículo (`POST /inventory-sessions`, o "Abrir sesión" en el panel admin) antes de poder registrar ventas.

Estas credenciales son solo para desarrollo local — nunca se usan en producción y el seed nunca se ejecuta contra una base de datos que no sea desechable.

## Pruebas

Todas las pruebas backend son E2E o unitarias sobre `fetch`, sin framework externo, y cada archivo resetea y siembra su propia base de datos para ser autocontenido:

```bash
cd backend

npm run test:unit:replenishment   # prueba unitaria de la fórmula de reabastecimiento
npm run test:e2e:phase2            # inventario, conteos, cierre de caja
npm run test:e2e:workshift         # turnos de trabajo + casos límite de cierre
npm run test:e2e:replenishment     # endpoint de reabastecimiento
npm run test:e2e:phase4            # ubicación, mensajería, dispatch

npm run test:e2e                    # todas las E2E en secuencia
npm test                             # unitarias + todas las E2E
```

Requieren MongoDB corriendo y el backend arrancado (`npm run dev`) en otra terminal.

Para el frontend, `npx expo-doctor` (dentro de `app/`) valida configuración del proyecto Expo.

## Resumen de fases de desarrollo

Desarrollado incrementalmente siguiendo las fases descritas en `PLAN.md`:

- **Fase 0 — Fundaciones:** backend base, autenticación con JWT y roles, módulos `users` y `products`, app Expo Router con `(auth)`, `driver`, `admin`.
- **Fase 1 — Núcleo de ventas:** `sales`, `payments`, `approvals` (aprobar/modificar/cancelar/marcar incidente), `audit`.
- **Prerequisito antes de Fase 2 — Turnos y vehículos:** módulo `workShifts` (inicio/fin de turno manual, independiente de auth) y asociación de cada venta a un `Vehicle`, necesarios para dar contexto a inventario y cierre.
- **Fase 2 — Inventario y cierre:** `inventory` (sesiones por vehículo), `inventoryCounts` (inicial/parcial/cierre), `closing` (conciliación de efectivo + inventario), estado `CLOSING_PENDING` para congelar una sesión mientras el manager la revisa.
- **Fase 3 — Reabastecimiento y conteo semanal:** `replenishment` (servicio de cálculo puro, sin efectos secundarios) y conteos tipo `WEEKLY` con reporte de discrepancias.
- **Fase 4 — Ubicación, mensajería y dispatch:** tres módulos independientes — `locations` (ping periódico + vista de mapa), `messaging` (manager → chofer), `dispatch` (asignación y ciclo de vida de entregas: pendiente → aceptada → completada/cancelada).
- **Fase 5 — Pulido final:** consistencia de UX en todas las pantallas (encabezados y navegación de regreso estandarizados vía `ScreenHeader`, estados de carga/vacío/error consistentes, feedback de éxito), validación de formularios en el cliente, revisión de diseño responsivo, esta documentación, y una pasada de limpieza de código.

## Limitaciones conocidas y deuda técnica

- **Sin notificaciones push.** El chofer se entera de mensajes o entregas nuevas solo al abrir la pantalla correspondiente (mitigado parcialmente con indicadores de conteo en el panel principal del chofer).
- **El panel admin no tiene filtros ni búsqueda en listados largos** (ventas pendientes, cierres, turnos) — funciona bien para el volumen de un solo negocio pequeño, pero no escala a cientos de registros simultáneos sin paginación o filtros.
- **`replenishment` no persiste historial de sugerencias** — se recalcula on-demand en cada consulta; si se necesita auditar qué se sugirió en el pasado, haría falta una colección nueva.
- **Los pings de ubicación no se purgan** — se guarda cada ping indefinidamente. Para uso prolongado en producción convendría un TTL index o un job de limpieza.
- **No hay tests automatizados de frontend** (solo pruebas E2E de backend + verificación manual en navegador). Un proyecto de mayor escala se beneficiaría de pruebas de componentes o E2E de UI (ej. Playwright/Detox).
- **El panel admin y la app del chofer comparten un único cliente Expo Router.** Es una decisión consciente para evitar duplicar UI (ver [Arquitectura](#arquitectura)), pero si el panel admin creciera mucho (tablas complejas, gráficas), convendría evaluar extraerlo a una app web independiente — el backend ya está desacoplado por API REST, así que ese cambio no requeriría tocarlo.
- **Roles `manager` y `admin` comparten permisos idénticos hoy.** El rol `admin` existe en el esquema como punto de extensión pero no hay todavía ninguna acción reservada solo para `admin`.

## Posibles mejoras futuras

- Notificaciones push para mensajes y dispatch nuevos.
- Filtros, búsqueda y paginación en los listados del panel admin.
- Historial persistente de sugerencias de reabastecimiento, para poder comparar sugerido vs. lo realmente reabastecido.
- Reportes exportables (CSV/PDF) de cierres y ventas por rango de fechas.
- Diferenciar permisos entre `manager` y `admin` (ej. solo `admin` puede reabrir cierres o gestionar usuarios).
- Tests de UI automatizados (Playwright para web, Detox para nativo).
