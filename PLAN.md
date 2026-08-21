# PLAN.md — Delivery App

> Documento de planificación. No contiene implementación todavía. Objetivo: definir arquitectura, estructura de carpetas, modelos de datos y fases de desarrollo antes de escribir código.

---

## 1. Análisis de requisitos (resumen)

La app resuelve un flujo operativo de venta ambulante con control administrativo:

- **Choferes** venden productos desde un vehículo/carrito y registran la venta desde el teléfono. Una venta representa una operación que **ya ocurrió físicamente**: el producto ya salió del vehículo en el momento en que se captura.
- Toda venta requiere **aprobación de un manager** antes de considerarse válida (estado `PENDING` → `APPROVED`). No existen ventas de chofer aprobadas automáticamente.

> **Regla de negocio:** *"Every sale created by a driver requires manager approval. There are no automatically approved driver sales."*
- El pago puede dividirse entre **efectivo y transferencia**, y debe sumar exactamente el total.
- El total puede **ajustarse con motivo**, pero nunca se pierde el precio original (subtotal, ajuste y total final conviven).
- Existe **trazabilidad completa**: quién crea, quién aprueba, quién modifica, cuándo y qué campos cambiaron.
- El **inventario** se controla por ruta/vehículo: inventario inicial, inventario esperado (calculado), inventario físico (contado), y diferencias.
- Existen **conteos** en distintos momentos: inicial, parciales, cierre diario, semanal.
- Existe **conciliación de efectivo** (efectivo esperado según ventas autorizadas vs. efectivo reportado).
- Existe un módulo de **reabastecimiento**, aislado, que sugiere cantidades según consumo.
- Existe un **panel administrativo** para el manager con visión global.
- Existen módulos independientes de **ubicación**, **mensajería** y **dispatch** (direcciones), desacoplados de ventas.

Principio rector: **módulos separados por dominio de negocio**, sin acoplar lógica entre ellos (ej. ventas no sabe nada de ubicación; ubicación no sabe nada de ventas).

---

## 2. Arquitectura general

Dos partes, un mismo lenguaje (JavaScript) en toda la pila:

```
delivery-app/
├── backend/     → Node.js + Express + MongoDB + Mongoose (API REST)
└── app/         → Expo + Expo Router (app móvil para choferes + panel web para manager)
```

### Decisión: un solo cliente Expo Router para móvil y panel admin

En vez de crear un segundo stack web (Next.js, etc.), se usa **Expo Router con su soporte de export web**. Esto evita duplicar dependencias y mantiene un único lenguaje de UI:

- `app/(driver)/...` — pantallas para choferes (uso típico: teléfono).
- `app/(admin)/...` — pantallas para el manager (uso típico: navegador, pero funcionan igual en móvil).
- `app/(auth)/...` — login, compartido.

Ambos consumen los mismos módulos de API (`src/modules/*/api.js`) y comparten componentes base. Si en el futuro el panel admin necesita crecer mucho (tablas complejas, gráficas pesadas), se puede extraer a una app web independiente sin tocar el backend, porque el backend ya está desacoplado por API REST.

### Backend: arquitectura modular por dominio

Cada módulo de negocio es una carpeta independiente con sus propias capas internas (`routes`, `controller`, `service`, `model`, `validation`). Nada de capas transversales complejas (no repositorios genéricos, no inyección de dependencias, no CQRS). Un módulo importa a otro **solo a través de su `service.js`**, nunca accediendo directo al modelo de otro módulo. Esto mantiene el bajo acoplamiento pedido sin añadir infraestructura extra.

Reglas simples de dependencia (evitan acoplamientos no deseados):

- `sales` puede usar `inventory` (para descontar) y `audit` (para dejar registro), pero **no** usa `locations` ni `messaging`.
- `locations` no sabe nada de `sales`.
- `messaging` y `dispatch` no saben nada de `sales` ni `inventory`.
- `replenishment` solo **lee** de `products`, `sales` e `inventoryCounts` (no escribe en ellos).
- `audit` es un módulo de solo escritura/lectura de logs, usado por cualquier módulo que modifique datos sensibles (sales, approvals, inventoryCounts, closing).

---

## 3. Estructura de carpetas

### 3.1 Backend

```
backend/
├── src/
│   ├── server.js                 # arranque del servidor
│   ├── app.js                    # configuración de Express (middlewares, montaje de rutas)
│   ├── config/
│   │   ├── db.js                 # conexión a MongoDB
│   │   └── env.js                # lectura de variables de entorno
│   ├── middlewares/
│   │   ├── auth.js               # verificación de JWT
│   │   ├── requireRole.js        # guard por rol (driver / manager / admin)
│   │   └── errorHandler.js
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.routes.js
│   │   │   ├── auth.controller.js
│   │   │   ├── auth.service.js
│   │   │   └── auth.validation.js
│   │   ├── users/
│   │   │   ├── user.model.js
│   │   │   ├── users.routes.js
│   │   │   ├── users.controller.js
│   │   │   ├── users.service.js
│   │   │   └── users.validation.js
│   │   ├── products/
│   │   │   ├── product.model.js
│   │   │   ├── products.routes.js
│   │   │   ├── products.controller.js
│   │   │   ├── products.service.js
│   │   │   └── products.validation.js
│   │   ├── sales/
│   │   │   ├── sale.model.js
│   │   │   ├── sales.routes.js
│   │   │   ├── sales.controller.js
│   │   │   ├── sales.service.js
│   │   │   └── sales.validation.js
│   │   ├── payments/
│   │   │   ├── payments.service.js       # validación de división de pago (sin modelo propio)
│   │   │   └── payments.validation.js
│   │   ├── approvals/
│   │   │   ├── approvals.routes.js
│   │   │   ├── approvals.controller.js
│   │   │   └── approvals.service.js      # aprobar / modificar / cancelar / marcar incidente
│   │   ├── inventory/
│   │   │   ├── inventorySession.model.js # inventario inicial por ruta/día
│   │   │   ├── inventory.routes.js
│   │   │   ├── inventory.controller.js
│   │   │   └── inventory.service.js      # cálculo de inventario esperado
│   │   ├── inventoryCounts/
│   │   │   ├── inventoryCount.model.js
│   │   │   ├── inventoryCounts.routes.js
│   │   │   ├── inventoryCounts.controller.js
│   │   │   └── inventoryCounts.service.js
│   │   ├── replenishment/
│   │   │   ├── replenishment.routes.js
│   │   │   ├── replenishment.controller.js
│   │   │   └── replenishment.service.js  # lógica aislada y reemplazable
│   │   ├── closing/
│   │   │   ├── closing.model.js
│   │   │   ├── closing.routes.js
│   │   │   ├── closing.controller.js
│   │   │   └── closing.service.js        # concilia efectivo + inventario
│   │   ├── audit/
│   │   │   ├── auditLog.model.js
│   │   │   └── audit.service.js          # logChange(), getHistory()
│   │   ├── locations/
│   │   │   ├── location.model.js
│   │   │   ├── locations.routes.js
│   │   │   ├── locations.controller.js
│   │   │   └── locations.service.js
│   │   ├── messaging/
│   │   │   ├── message.model.js
│   │   │   ├── messaging.routes.js
│   │   │   ├── messaging.controller.js
│   │   │   └── messaging.service.js
│   │   └── dispatch/
│   │       ├── dispatch.model.js
│   │       ├── dispatch.routes.js
│   │       ├── dispatch.controller.js
│   │       └── dispatch.service.js
│   └── shared/
│       ├── constants.js          # roles, estados, métodos de pago, tipos de conteo
│       └── httpError.js
├── package.json
└── .env.example
```

### 3.2 App (Expo Router)

```
app/
├── app/                            # rutas (Expo Router)
│   ├── (auth)/
│   │   └── login.js
│   ├── (driver)/
│   │   ├── _layout.js
│   │   ├── index.js                # inicio chofer
│   │   ├── new-sale.js             # registrar venta
│   │   ├── my-sales.js
│   │   ├── inventory-count.js      # conteo parcial / cierre
│   │   └── inbox.js                # mensajes + direcciones recibidas
│   └── (admin)/
│       ├── _layout.js
│       ├── index.js                # dashboard
│       ├── sales-pending.js
│       ├── drivers-map.js
│       ├── inventory.js
│       ├── counts-weekly.js
│       ├── closings.js
│       ├── replenishment.js
│       └── send-message.js
├── src/
│   ├── modules/                    # espejo del dominio del backend (solo cliente)
│   │   ├── auth/          (api.js, useAuth.js)
│   │   ├── products/      (api.js)
│   │   ├── sales/         (api.js, SaleForm.js, PaymentSplitInput.js)
│   │   ├── approvals/     (api.js, SaleReviewCard.js)
│   │   ├── inventory/     (api.js, InventoryCountForm.js)
│   │   ├── replenishment/ (api.js, ReplenishmentTable.js)
│   │   ├── locations/     (api.js, useLocationSender.js, DriversMap.js)
│   │   ├── messaging/     (api.js, MessageComposer.js)
│   │   └── dispatch/      (api.js, AddressCard.js)
│   ├── shared/
│   │   ├── components/     # Button, Input, Card, Icon, etc.
│   │   ├── constants.js    # mismo vocabulario que el backend (roles, estados)
│   │   └── httpClient.js   # instancia fetch/axios con token
│   └── store/               # estado global mínimo (ej. usuario logueado)
├── app.json
└── package.json
```

Cada componente de pantalla en `app/app/**` es **delgado**: solo compone componentes de `src/modules/*` y llama a sus hooks/api. La lógica de negocio (cálculos, validaciones) vive en `src/modules/*`, nunca en el archivo de ruta.

---

## 4. Modelos principales de MongoDB (Mongoose)

Notas: se muestran campos relevantes, no el schema completo. Todos los modelos incluyen `createdAt`/`updatedAt` (`timestamps: true`).

### `User`
```js
{
  name: String,
  email: String,
  passwordHash: String,
  role: { type: String, enum: ['driver', 'manager', 'admin'] },
  active: Boolean,
}
```

### `Product`
```js
{
  name: String,
  icon: String,        // nombre/clave de icono
  basePrice: Number,
  active: Boolean,
}
```

### `Vehicle` (ruta/carrito)
```js
{
  name: String,         // ej. "Carrito 3", "Ruta Norte"
  assignedDriver: ObjectId(User),
  active: Boolean,
}
```

### `Sale`
```js
{
  driver: ObjectId(User),
  vehicle: ObjectId(Vehicle),
  items: [{
    product: ObjectId(Product),
    quantity: Number,
    unitPrice: Number,     // precio al momento de la venta (no cambia si el producto cambia después)
    subtotal: Number,
  }],
  subtotalOriginal: Number,      // suma de items, nunca se sobrescribe
  adjustment: {
    amount: Number,              // puede ser negativo o positivo
    reason: String,
  },
  totalFinal: Number,            // subtotalOriginal + adjustment.amount
  payments: [{
    method: { type: String, enum: ['cash', 'transfer'] },
    amount: Number,
  }],
  status: { type: String, enum: ['PENDING', 'APPROVED', 'CANCELLED', 'INCIDENT'] },
  createdBy: ObjectId(User),
  approval: {
    approvedBy: ObjectId(User),
    approvedAt: Date,
  },
  cancellation: {
    reason: String,           // obligatorio si status === 'CANCELLED'
    cancelledBy: ObjectId(User),
    cancelledAt: Date,
  },
  incident: {
    note: String,             // descripción de la anomalía
    markedBy: ObjectId(User),
    markedAt: Date,
  },
}
```
Validación clave (en `payments` + `sales.validation.js`): `sum(payments.amount) === totalFinal`.

**Estados y su significado:**

| Estado | Cuándo se usa | Quién lo puede fijar |
|---|---|---|
| `PENDING` | Estado inicial de toda venta creada por un chofer. La operación ya ocurrió, pero aún no fue revisada. | Sistema, al crear la venta. |
| `APPROVED` | El manager revisó la venta (productos, pago, total) y la valida. Puede haber corregido campos antes de aprobar. | Manager, vía `approvals`. |
| `CANCELLED` | La operación **realmente se anuló** (ej. el cliente devolvió el producto, la venta nunca se completó). Requiere `cancellation.reason` obligatorio. No borra la venta original, solo cambia su estado y preserva el motivo. | Manager, vía `approvals`. |
| `INCIDENT` | Marca una **anomalía** sobre la venta (ej. discrepancia detectada, pago no verificable, sospecha de error) sin borrar ni falsear el movimiento original. La venta sigue existiendo tal como se registró, solo queda señalada para investigación. | Manager, vía `approvals`. |

Ninguno de estos estados se asigna automáticamente por el sistema salvo `PENDING` al crear la venta — todo lo demás requiere una acción explícita del manager.

Si el chofer capturó algo mal (cantidad, producto, método de pago), el manager **no cancela ni recrea la venta**: usa `approvals.service` para modificar los campos necesarios (guardando el valor anterior en `AuditLog`) y luego aprueba la venta corregida. `CANCELLED` se reserva exclusivamente para cuando la operación en sí no debe contar como venta.

### `AuditLog`
```js
{
  entity: String,          // 'Sale', 'InventoryCount', 'Closing', etc.
  entityId: ObjectId,
  action: String,          // 'CREATE', 'UPDATE', 'APPROVE', 'CANCEL', 'MARK_INCIDENT'
  changes: [{ field: String, oldValue: Mixed, newValue: Mixed }],
  performedBy: ObjectId(User),
  performedAt: Date,
}
```
Usado por `sales`/`approvals` (cambios de manager sobre una venta), `inventoryCounts` y `closing`. Es la fuente única de verdad para "qué se modificó, quién y cuándo".

### `InventorySession` (inventario inicial de una jornada)
```js
{
  vehicle: ObjectId(Vehicle),
  driver: ObjectId(User),
  date: Date,
  initialStock: [{ product: ObjectId(Product), quantity: Number }],
  createdBy: ObjectId(User),
}
```

### `InventoryCount`
```js
{
  vehicle: ObjectId(Vehicle),
  driver: ObjectId(User),
  type: { type: String, enum: ['INITIAL', 'PARTIAL', 'CLOSING', 'WEEKLY'] },
  counts: [{ product: ObjectId(Product), quantityCounted: Number }],
  expectedAtCountTime: [{ product: ObjectId(Product), quantityExpected: Number }], // snapshot calculado
  createdBy: ObjectId(User),
}
```
Las diferencias (`quantityCounted - quantityExpected`) se calculan al leer, no se guardan duplicadas (evita datos desincronizados).

### `Closing` (cierre diario)
```js
{
  vehicle: ObjectId(Vehicle),
  driver: ObjectId(User),
  date: Date,
  expectedCash: Number,       // según ventas APPROVED del día
  reportedCash: Number,       // lo que el chofer reporta
  cashDifference: Number,     // calculado
  inventoryCount: ObjectId(InventoryCount),  // referencia al conteo tipo CLOSING
  closedBy: ObjectId(User),
  status: { type: String, enum: ['OPEN', 'CLOSED'] },
}
```

### `LocationPing` (módulo `locations`, independiente)
```js
{
  driver: ObjectId(User),
  lat: Number,
  lng: Number,
  recordedAt: Date,     // hora del dispositivo
  receivedAt: Date,     // hora del servidor
}
```
Se guarda cada ping (permite historial futuro). La "ubicación actual" se obtiene con el último ping por chofer (índice `{ driver: 1, recordedAt: -1 }`). "Actualizada vs antigua" se calcula en el momento de leer: `isStale = now - recordedAt > STALE_THRESHOLD_MS` (constante configurable, ej. 5 minutos). No se guarda un booleano `isStale` porque quedaría obsoleto.

### `Message` (módulo `messaging`)
```js
{
  sender: ObjectId(User),        // manager
  recipients: [ObjectId(User)],  // choferes
  body: String,
  readBy: [{ driver: ObjectId(User), readAt: Date }],
}
```

### `Dispatch` (módulo `dispatch`, direcciones/destinos)
```js
{
  sender: ObjectId(User),
  recipients: [ObjectId(User)],
  address: {
    label: String,        // texto libre, ej. "Bodega Norte"
    raw: String,           // dirección completa
    lat: Number,           // opcional
    lng: Number,            // opcional
    mapsUrl: String,        // generado, ej. https://maps.google.com/?q=...
  },
  readBy: [{ driver: ObjectId(User), readAt: Date }],
}
```

`replenishment` **no tiene modelo propio**: es un servicio de cálculo que lee `Product`, `Sale` e `InventoryCount`.

---

## 5. Flujo de una venta

1. El chofer abre "Nueva venta", selecciona productos y cantidades → la app calcula `subtotalOriginal`. Esta captura representa algo que **ya ocurrió**: el producto ya salió del vehículo.
2. Si aplica, el chofer (o el manager luego) puede indicar un `adjustment` con `reason` obligatorio → `totalFinal = subtotalOriginal + adjustment.amount`.
3. El chofer distribuye el pago entre `cash` y `transfer`. La app valida en el cliente que `sum(payments) === totalFinal`; el backend **repite la misma validación** (nunca confiar solo en el cliente).
4. Se envía `POST /sales` con `status: 'PENDING'`, `createdBy` = chofer autenticado, `createdAt` = ahora. **Toda venta de chofer nace `PENDING`; no hay ruta de código que la cree ya `APPROVED`.**
5. La venta aparece en el panel del manager (`ventas pendientes`). Todas las ventas de chofer, sin excepción, pasan por esta revisión.
6. El manager revisa productos, método de pago y total. Si el chofer capturó algo mal (ej. cantidad, producto o pago incorrectos), el manager **modifica la venta** — nunca la recrea — vía `approvals.service`, que guarda el valor anterior y el nuevo en `AuditLog` (`performedBy` = manager) y recalcula `totalFinal` si corresponde.
7. Con la venta ya correcta, el manager decide el desenlace:
   - **Aprobar** (`PATCH /approvals/:saleId/approve`) → `status: 'APPROVED'`, `approval.approvedBy`, `approval.approvedAt`. Es el desenlace normal para una venta que sí ocurrió como se describe.
   - **Cancelar** (`PATCH /approvals/:saleId/cancel`) → `status: 'CANCELLED'`, con `cancellation.reason` obligatorio. Solo cuando la operación realmente se anuló.
   - **Marcar incidente** (`PATCH /approvals/:saleId/mark-incident`) → `status: 'INCIDENT'`, con `incident.note`. Señala una anomalía sin alterar el movimiento original; puede resolverse después (ej. corrigiendo datos y aprobando, o cancelando si finalmente se determina que no fue una venta real).
8. Cada transición de estado queda en `AuditLog` (acción `APPROVE`, `CANCEL` o `MARK_INCIDENT`, con `performedBy` y fecha). El efecto de cada estado sobre inventario y efectivo se documenta en la sección 6.

---

## 6. Flujo de cierre de inventario y efectivo

**Inicio de jornada:** se crea un `InventorySession` con el stock inicial por vehículo/ruta (lo carga el manager o el chofer, según se decida en fase de detalle).

**Cómo afecta cada estado de venta al inventario y al efectivo esperado:**

| Estado | ¿Cuenta para inventario esperado? | ¿Cuenta para efectivo esperado? | Razón |
|---|---|---|---|
| `PENDING` | Sí | No | El producto ya salió físicamente del vehículo, así que debe descontarse del inventario aunque el manager no la haya revisado todavía. El efectivo no se da por bueno hasta que el manager valida la venta (puede corregirse o cancelarse). |
| `APPROVED` | Sí | Sí | Venta validada por el manager: el movimiento de producto y el dinero se consideran ciertos. |
| `CANCELLED` | No | No | La operación se anuló realmente; se excluye de ambos cálculos, pero el registro permanece (con `cancellation.reason`) para trazabilidad — nunca se borra. |
| `INCIDENT` | Sí | No | El movimiento original no se falsea ni se borra, así que sigue contando para el inventario (el producto salió del vehículo). Se excluye del efectivo esperado hasta que el manager la resuelva (corrigiendo y aprobando, o cancelando), ya que hay una anomalía sin resolver. |

**Durante la jornada — inventario esperado:**
`inventarioEsperado(producto) = initialStock(producto) − Σ cantidades vendidas en Sale.items (ventas con status PENDING, APPROVED o INCIDENT)`.
Se excluyen solo las `CANCELLED`, porque son las únicas donde la operación no ocurrió realmente. El resto de estados representan un movimiento físico real, se haya validado o no.

**Durante la jornada — efectivo esperado (para el cierre):**
`efectivoEsperado = Σ payments.amount de Sale con status APPROVED` (únicamente ventas ya validadas por el manager; `PENDING` puede aún corregirse o cancelarse, e `INCIDENT` está señalada como anómala hasta resolverse).

**Cierre diario:**
1. El chofer ingresa el conteo físico → se crea un `InventoryCount` tipo `CLOSING`, con snapshot de `expectedAtCountTime`.
2. El chofer reporta el efectivo que tiene → se crea/actualiza `Closing` con `reportedCash`.
3. El sistema calcula `cashDifference = reportedCash − expectedCash` y, por producto, `quantityCounted − quantityExpected`.
4. El manager ve ambas diferencias en el panel (`closings`), puede dejar observaciones (quedan en `AuditLog`), y marca el `Closing` como `CLOSED`.

---

## 7. Conteos parciales y semanales

- **Conteo parcial:** el chofer puede, en cualquier momento del día, capturar un conteo (`InventoryCount` tipo `PARTIAL`) sin cerrar la jornada. El sistema calcula el inventario esperado *hasta ese momento* (mismo cálculo que arriba, pero con fecha de corte = ahora) y muestra la diferencia de inmediato. Esto permite detectar un faltante (ej. producto roto, robo, error de conteo) antes de llegar al cierre, cuando ya es más difícil investigar la causa.
- **Conteo semanal:** mismo modelo `InventoryCount`, tipo `WEEKLY`, normalmente disparado por el manager desde el panel para uno o varios vehículos. Sirve como auditoría de más bajo nivel de frecuencia y como insumo de consumo semanal para `replenishment`. No requiere un modelo nuevo, solo un `type` distinto — así se pueden agregar más tipos de conteo en el futuro sin tocar el esquema.

---

## 8. Cálculo de reabastecimiento

Vive enteramente en `backend/src/modules/replenishment/replenishment.service.js`, como función pura (entrada → salida), sin efectos secundarios, para poder rehacer la fórmula sin tocar el resto del sistema.

Entradas por producto:
- `stockActual`: último conteo conocido (o inventario esperado si no hay conteo reciente).
- `consumoDiario`: promedio de unidades vendidas por día en una ventana reciente (ej. últimos 7 días).
- `consumoSemanal`: unidades vendidas en los últimos 7 días.
- `stockEsperado`: proyección de cuánto quedaría sin reabastecer (ej. a N días).

Salida (lo que ve el manager):

| Producto | Stock actual | Stock esperado | Consumo diario | Consumo semanal | Cantidad sugerida |
|---|---|---|---|---|---|

Fórmula inicial simple (reemplazable después):
```
cantidadSugerida = max(0, (consumoDiario * diasCobertura + stockSeguridad) − stockActual)
```
`diasCobertura` y `stockSeguridad` son constantes configurables (no hardcodeadas en la fórmula), para poder ajustarlas o mover a un futuro parámetro por producto.

El endpoint `GET /replenishment` simplemente orquesta: lee productos activos, pide a `sales.service` el consumo por producto/rango, pide a `inventoryCounts.service` el último conteo, y aplica la fórmula. No persiste resultados (se recalcula on-demand); si más adelante se requiere historial de sugerencias, se agrega una colección sin romper el contrato del servicio.

---

## 9. Mensajería, direcciones (dispatch) y ubicación

Tres módulos independientes, sin dependencias cruzadas con `sales` ni entre sí más allá de compartir `User`.

**`locations`:** la app del chofer envía su posición periódicamente (`POST /locations`, ej. cada X minutos o al cambiar significativamente). El backend solo guarda el ping. El panel admin consulta `GET /locations/current` → última posición por chofer + `recordedAt` + un flag `isStale` calculado en el momento de responder (no almacenado). El mapa (`drivers-map.js`) pinta un marcador por chofer con color distinto si está "antiguo".

**`messaging`:** el manager compone un mensaje libre y elige uno o varios choferes (`POST /messaging`). El chofer ve sus mensajes en `inbox.js`, ordenados por fecha, con remitente y hora. Marcar como leído es opcional para el MVP.

**`dispatch`:** mismo patrón que `messaging`, pero el payload es una dirección/destino (`label`, `raw`, `lat/lng` opcionales, `mapsUrl` generado en el backend). En la app del chofer se muestra como una tarjeta clara (`AddressCard`) con un botón "Abrir en mapas" que usa un deep link (`geo:` en Android / `maps://` en iOS, o el `mapsUrl` como fallback universal).

Se mantienen separados de `sales` explícitamente: una venta nunca referencia un `Message` o `Dispatch`, y viceversa. Si en el futuro se quiere relacionar (ej. "este mensaje aplica a esta ruta"), se hace por `vehicle`/`driver`, no por acoplamiento directo de módulos.

---

## 10. Fases de desarrollo

**Fase 0 — Fundaciones**
Backend base (Express + Mongoose + conexión DB), estructura de carpetas de todos los módulos (aunque vacíos), módulo `auth` (login + JWT + roles), módulo `users`, módulo `products` (CRUD simple). App Expo Router base con `(auth)`, `(driver)`, `(admin)`, login funcional.

**Fase 1 — Núcleo de ventas (MVP)**
`sales` (crear venta, división de pago, validación de suma, ajuste con motivo), `approvals` (listar pendientes, modificar con auditoría, aprobar / cancelar / marcar incidente), `audit` (log genérico). Pantallas: `new-sale`, `my-sales` (chofer); `sales-pending` (manager).

**Fase 2 — Inventario y cierre**
`inventory` (sesión inicial, cálculo de esperado), `inventoryCounts` (parcial, cierre, inicial), `closing` (conciliación de efectivo + inventario). Pantallas: `inventory-count` (chofer); `inventory`, `closings` (manager).

**Fase 3 — Reabastecimiento y conteo semanal**
`replenishment` (servicio + endpoint), conteo tipo `WEEKLY` sobre el modelo existente. Pantallas: `replenishment`, `counts-weekly` (manager).

**Fase 4 — Ubicación, mensajería y dispatch**
`locations` (envío periódico + lectura de posición actual), `messaging`, `dispatch`. Pantallas: `drivers-map`, `send-message` (manager); `inbox` (chofer).

**Fase 5 — Pulido**
Indicadores de frescura de ubicación en UI, filtros y búsqueda en listados del panel, mejoras de UX en formularios, manejo de errores consistente, preparación de puntos de extensión (nuevos métodos de pago, nuevos roles, notificaciones push) documentados como comentarios `// EXTENSION POINT` donde aplique.

---

## 11. MVP vs. siguiente iteración

**MVP inicial (Fases 0 + 1):**
- Login con roles (driver / manager).
- Catálogo de productos: nombre, icono, precio base, activo/inactivo. **`Product` no lleva inventario propio** — el inventario se maneja siempre por jornada/ruta/vehículo (`InventorySession` / `InventoryCount`, Fase 2).
- Registro de venta por el chofer: productos, cantidades, ajuste con motivo, división de pago efectivo/transferencia con validación de suma.
- Toda venta nace `PENDING`. Ninguna venta de chofer se aprueba automáticamente.
- Panel del manager: ver ventas pendientes, ver detalle (productos, pago, total), modificar campos, aprobar / cancelar (con motivo) / marcar incidente.
- Trazabilidad básica: quién creó, cuándo, quién aprobó, cuándo, qué se modificó (vía `AuditLog`).

Esto ya entrega el objetivo más crítico: **registrar ventas y validarlas con el manager**, con trazabilidad real.

**Inmediatamente después (Fase 2, alta prioridad):**
- Inventario inicial por ruta/vehículo.
- Cálculo de inventario esperado.
- Conteos parciales y de cierre.
- Conciliación de efectivo esperado vs. reportado.

**Después (Fases 3 y 4, prioridad media):**
- Reabastecimiento sugerido.
- Conteo semanal.
- Ubicación de choferes en mapa.
- Mensajería y dispatch de direcciones.

**Al final (Fase 5):**
- Pulido general y puntos de extensión.

---

## Puntos de extensión previstos (no implementar aún, solo dejar el diseño abierto)

- **Nuevos métodos de pago:** `payments.method` es un enum en `constants.js`, no hardcodeado en múltiples archivos — agregar uno nuevo es un cambio de una lista + UI.
- **Nuevos roles:** `User.role` es enum; los guards de rutas usan `requireRole([...])`, no `if (role === 'manager')` disperso.
- **Notificaciones push:** `messaging` y `dispatch` ya son el punto natural donde enchufar un envío push (Expo Notifications) sin rediseñar el módulo.
- **Historial de ubicaciones:** ya se guarda cada `LocationPing` (no solo la última), así que un historial/recorrido es una consulta nueva, no un cambio de modelo.
- **Optimización de rutas:** quedaría como un módulo nuevo que lee `locations` y `dispatch`, sin modificarlos.
- **Nuevos tipos de conteo:** `InventoryCount.type` es un enum abierto a agregar valores.

---

**Fin del plan. No se ha implementado código todavía — a la espera de instrucciones para comenzar con la Fase 0.**
