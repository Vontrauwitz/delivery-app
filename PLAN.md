# PLAN.md — Delivery App

> Documento de planificación original. Las secciones 1–11 y "Puntos de extensión" (más abajo) se escribieron **antes** de implementar código y se conservan tal cual por su valor como registro de la arquitectura e intención original — varias decisiones ahí siguen vigentes exactamente como se diseñaron (ej. el cálculo de `isStale` en `locations`, la separación estricta por dominio, los enums abiertos). Donde la implementación real se apartó o amplió ese diseño original, se añadieron notas explícitas en línea en vez de reescribir la historia.
>
> El bloque que sigue es la capa viva de estado del proyecto — se actualiza en cada checkpoint de documentación y es la fuente de verdad sobre "qué existe hoy". Se escribe en español, como el resto del documento.

---

## IMPLEMENTADO / CERRADO

Verificado contra el repositorio real (módulos de backend, rutas de frontend y suites de test que pasan), no contra los supuestos del plan original:

- **Fundamentos / autenticación / usuarios / productos** — autenticación JWT con guards por rol (`driver`/`manager`/`admin`), módulo `users` (incluyendo el CRUD completo de choferes, solo para manager, agregado después — ver Gestión de choferes/vehículos más abajo), CRUD de `products`, más un módulo `promotions` (precios por paquete "cantidad por precio") que no existía en absoluto en el plan original.
- **Ventas + flujo de aprobación del manager** — `sales` + `approvals`, exactamente el modelo `PENDING → APPROVED/CANCELLED/INCIDENT` descrito en las Secciones 5–6 más abajo, implementado tal como se diseñó originalmente.
- **Fundamento de AuditLog** — `audit.service.logChange()`/`getHistory()`, sin cambios de forma desde el diseño original (`entity`, `entityId`, `action`, `changes[]`, `performedBy`, `performedAt`). El enum de `action` sí creció mucho más allá de los cinco valores ilustrativos originales (`CREATE`/`UPDATE`/`APPROVE`/`CANCEL`/`MARK_INCIDENT`) hasta ~35 valores que abarcan casi todos los módulos — gestión de choferes, programación, cierres, y ahora mensajería/dispatch (ver abajo). El mecanismo en sí nunca cambió; solo creció su vocabulario, tal como lo previó el diseño original ("fuente única de verdad").
- **Sesiones de inventario y controles de inventario** — `inventory` (stock actual por chofer, no por vehículo como se bosquejó originalmente en la Sección 4 — el inventario sigue al chofer a través de cambios de vehículo) e `inventoryCounts` (`INITIAL`/`PARTIAL`/`CLOSING`/`WEEKLY`), tal como se diseñó.
- **Inicio/fin de turno (WorkShift)** — **no estaba en absoluto en el plan original.** Se agregó un concepto de fichaje de entrada/salida del chofer (`WorkShift`, un solo turno `OPEN` por chofer a la vez) como módulo propio, separado de las sesiones de inventario y de la programación. Ahora es la base contra la que se compara la programación de choferes (ver abajo).
- **Flujo de cierre** — `closing` (conciliación de efectivo + inventario), implementado con un conjunto de estados más rico que el bosquejado originalmente: `Closing` ahora tiene `OPEN`/`CLOSED`/`REOPENED` (un manager puede devolver un cierre para corrección — el plan original solo tenía `OPEN`/`CLOSED`).
- **Gestión de choferes/vehículos** — `vehicles` promovido a módulo completo; CRUD completo de choferes (solo manager: crear/editar/activar/desactivar/borrado definitivo) agregado sobre el módulo `users` original, mínimo, con verificación de referencias antes del borrado definitivo (ventas, turnos de trabajo, turnos programados, excepciones de horario, inventario, dispatch, pings de ubicación, mensajes, y el propio historial de auditoría del chofer bloquean el borrado; la desactivación nunca lo hace) y cobertura completa de auditoría `DRIVER_*`. Nada de esto existía en el plan original.
- **Programación de choferes / horarios recurrentes / excepciones** — un subsistema enteramente nuevo, no presente en el plan original: `User.defaultShift` (patrón semanal recurrente, con una compuerta `effectiveFrom`), `DriverScheduleException` (excepción puntual para una fecha: `WORK`/`REST`/`CUSTOM`), `ScheduledShift` (un turno explícito, luego emparejado con un `WorkShift` real), y `shared/scheduleResolution.js` (una cadena de prioridad determinista: `ScheduledShift` explícito > `DriverScheduleException` > `defaultShift` recurrente) más un endpoint en vivo de estado "esperado vs. real" usado por las alertas del dashboard del manager.
- **Dashboard de administración** — un dashboard de manager construido desde cero (métricas, alertas operativas, gráfica de ventas de 7 días, desglose por método de pago, productos más vendidos, vista rápida de inventario) con un sistema visual "neo-brutalista" aprobado (`neoTheme.js`/`NeoCard`), que no formaba parte de la descripción mínima del panel en el plan original.
- **Navegación de Configuración** — `Configuración` es ahora una pantalla de aterrizaje por categorías (no un formulario de ajustes plano) que enlaza a:
  - **Choferes** — el CRUD de gestión de choferes de arriba.
  - **Horarios** — el subsistema de programación de choferes de arriba (misma pantalla `Programación`, con contexto de navegación de regreso distinto según si se entró desde Configuración o desde el detalle de un chofer específico).
  - **Reabastecimiento** — los ajustes originales de cobertura/stock de seguridad por producto, migrados al mismo sistema visual.
- **Mensajería** — módulo `messaging`: el manager redacta a uno o varios choferes, con un flag opcional `important` (no estaba en el modelo original), bandeja de entrada del chofer con estado leído/no leído y una insignia de no-leídos en el dashboard del chofer.
- **Dispatch** — implementado como un concepto genuinamente distinto y más rico que el descrito en el plan original (ver la nota en la Sección 4 más abajo): una máquina de estados completa `PENDING → ACCEPTED → COMPLETED` más `CANCELLED` iniciado por el manager, propiedad del chofer verificada del lado del servidor en cada transición, y un `mapsUrl` calculado en el servidor que se abre mediante un enlace seguro por plataforma ("Abrir en mapas") — no la simple "tarjeta de acuse de recibo con dirección" bosquejada originalmente.
- **Integración de AuditLog en Mensajería + Dispatch** — `MESSAGE_SENT`, `MESSAGE_READ` (idempotente — volver a leer un mensaje ya leído nunca escribe una entrada duplicada), `DISPATCH_CREATED`, `DISPATCH_ACCEPTED`, `DISPATCH_COMPLETED`, `DISPATCH_CANCELLED`. Reutiliza exactamente el `audit.service.logChange()` existente — no se introdujo ningún mecanismo de registro paralelo.
- **Tickets de solicitud de reabastecimiento** — nuevo módulo `replenishmentRequests` (sibling de `replenishment`, que conserva intacta su función original de cálculo/config): modelo `ReplenishmentRequest` persistente con máquina de estados `DRAFT → SENT → FULFILLED`, con `CANCELLED` como alterno; cada ítem guarda un `productSnapshot.name` capturado al momento de agregarse, para que el ticket siga siendo legible aunque el producto se renombre, desactive o (más raro) se borre después. Chofer/vehículo opcionales, con validación cruzada cuando se dan ambos (el vehículo debe estar asignado a ese chofer). Texto para compartir generado de forma determinista y calculado al leer (nunca persistido), expuesto como `shareText` en la respuesta — mismo principio que `mapsUrl` en Dispatch. Compartir usa `Share` nativo de React Native en iOS/Android y, en web, la Web Share API con retroceso a portapapeles — sin ninguna integración de proveedor externo (Twilio/WhatsApp Business) ni dependencia nueva instalada. Abrir la hoja de compartir nunca marca el ticket como `SENT` por sí solo; eso sigue siendo una acción explícita del manager. Cobertura de AuditLog completa desde el primer commit de este módulo (`REPLENISHMENT_REQUEST_CREATED/UPDATED/SENT/FULFILLED/CANCELLED`), no diferida como en el primer paso de Mensajería/Dispatch. UI integrada en la pantalla ya existente `admin/settings/replenishment.js` mediante una pestaña "Solicitudes" junto a la configuración de cobertura/stock de seguridad, sin crear una pantalla o área de almacén separada. Además, un producto referenciado por un `ReplenishmentRequest` ahora cuenta como referencia real para `products.service.isProductReferenced` (vía el propio `replenishmentRequests.service`, no acoplando el modelo directamente) — no puede borrarse en definitivo, aunque sí desactivarse.
- **Alertas (reglas operativas configurables + alertas persistentes)** — nuevo módulo `alerts` con dos modelos separados: `AlertRule` (configuración persistente por manager: `key`, `enabled`, `severity`, `config` con solo los campos numéricos que aplican a cada regla) y `OperationalAlert` (el evento concreto, con máquina de estados `OPEN → ACKNOWLEDGED`, y `OPEN`/`ACKNOWLEDGED → RESOLVED`; `RESOLVED` es terminal por ocurrencia). Cinco reglas del primer set implementadas, cada una reutilizando lógica ya existente en vez de duplicarla: `DRIVER_LATE_START`/`DRIVER_SHIFT_OVERRUN` (reutilizan `driverSchedule.service.getStatusForAllDrivers`/`shared/scheduleResolution.js` tal cual), `LOCATION_STALE` (chofer con `WorkShift` `OPEN` + último `LocationPing` más viejo que el umbral configurable), `LOW_INVENTORY` (reutiliza `replenishment.service.getReplenishmentSuggestions` — el stock de seguridad configurado ahí es la única fuente de verdad, sin un segundo sistema de umbrales), `PENDING_APPROVAL_TOO_LONG` (reutiliza `approvals.service.listPending`). Evaluación determinista y idempotente vía `POST /alerts/evaluate` (y automáticamente al listar, `GET /alerts`) — sin cron ni cola: dedupe por `dedupeKey` con un índice único parcial (`{dedupeKey, active}`, mismo patrón que el índice parcial de `WorkShift` para "un solo turno OPEN por chofer"), auto-resuelve la alerta activa cuya condición ya no es cierta, nunca reabre una `RESOLVED` histórica. Deshabilitar una regla congela sus alertas existentes tal cual están (ni las resuelve ni las toca) — solo deja de evaluarla; al reactivarla, retoma exactamente donde se quedó. AuditLog cubre solo acciones humanas (`ALERT_RULE_UPDATED`, `ALERT_ACKNOWLEDGED`) — el ciclo de vida generado por máquina (creado/disparado de nuevo/resuelto) ya vive en el propio `OperationalAlert` (`firstTriggeredAt`/`lastTriggeredAt`/`resolvedAt`), duplicarlo en AuditLog habría sido puro ruido redundante. Frontend: `Configuración → Alertas` (reglas/umbrales) separado de una pantalla operativa `Alertas` de nivel superior (alertas activas/reconocidas/historial, con badge de conteo e integración en el panel "Alertas operativas" del dashboard, que dejó de calcular alertas del lado del cliente). Deliberadamente diferido: `REPLENISHMENT_REQUEST_PENDING_TOO_LONG` (ver "Registro de cambios" abajo para el razonamiento) y todo mecanismo de entrega externo (push/SMS/WhatsApp/email/escalamiento automático) — `AlertRule` está diseñado para que esos se conecten después sin rediseñar el dominio.
- **Mapa Operativo + Cola de Dispatch** — Dispatch sigue siendo la única fuente de verdad para destinos (no se creó un dominio separado de "pool de direcciones"). Nuevo estado `UNASSIGNED` insertado antes de `PENDING` en la máquina de estados (`UNASSIGNED → PENDING → ACCEPTED → COMPLETED`, `CANCELLED` terminal y alcanzable desde `UNASSIGNED`/`PENDING`/`ACCEPTED`) — `driver` pasó a opcional en el modelo; crear un dispatch **con** chofer sigue arrancando en `PENDING` exactamente como antes (compatibilidad total hacia atrás), crear **sin** chofer lo deja `UNASSIGNED` en el pool operativo, invisible para cualquier chofer. Creación en lote (`POST /dispatch/batch`, hasta 50 direcciones) no atómica a propósito — cada línea se recorta/valida/crea de forma independiente y el resultado reporta éxito/error por línea, para que una dirección mala nunca bloquee el resto de un paste grande. Asignación (`PATCH /dispatch/:id/assign`) y reasignación usan el mismo endpoint server-autoritativo (revalida el estado actual del dispatch, no lo que el cliente creía tener) y el mismo para asignación en lote (`POST /dispatch/batch-assign`, reporta qué ids fallaron sin abortar el resto). `routeOrder` mínimo (número creciente por chofer, asignado al momento de asignar) preparado para una futura optimización de rutas — ver el checkpoint de Route Planning Foundation más abajo, donde pasó a ser realmente reordenable. Corrección de dirección en vivo (`PATCH /dispatch/:id/destination`, manager/admin, permitida en `UNASSIGNED`/`PENDING`/`ACCEPTED`, nunca en estados terminales) actualiza el mismo registro — nunca crea un dispatch de reemplazo — preserva chofer/estado/`routeOrder` sin tocarlos, y limpia las coordenadas existentes si el texto de la dirección cambia sin coordenadas nuevas en la misma petición (nunca deja coordenadas obsoletas, nunca inventa unas nuevas). Notifica al chofer asignado reutilizando `messaging.service.sendMessage` tal cual (sin canal nuevo) cuando la dirección/coordenadas cambian. Auditoría nueva: `DISPATCH_ASSIGNED`, `DISPATCH_REASSIGNED`, `DISPATCH_DESTINATION_UPDATED` (esta última con dirección anterior/nueva y si las coordenadas cambiaron/se limpiaron, nunca el contenido de `note`). **Divergencia real vs. instrucción — documentada, no oculta:** el proyecto no tiene ninguna librería de mapas (`react-native-maps`, Leaflet, Mapbox) ni proveedor de geocodificación; agregar una ahora habría exigido una recompilación nativa y, en Android, una API key de Google Maps (una decisión de proveedor pago que este checkpoint tenía instrucción explícita de NO tomar sin aprobación). Se consultó al usuario y se optó explícitamente por una vista operativa tipo tablero/lista (`admin/map.js`, "Mapa operativo") en vez de un canvas de mapa real: choferes y destinos como tarjetas con estado, frescura de ubicación y conteo de paradas activas, cada uno con "Abrir en mapa" que reutiliza el mismo enlace `mapsUrl`/`openInMaps` ya usado por Dispatch para delegar la geografía real a la app de mapas nativa del dispositivo. Un mapa con canvas real sigue pendiente (ver "PENDIENTE / BACKLOG"). **Commit:** `2b510b9c6d1288c05fcec254e786a6c28a5da89e` — *feat: add operational dispatch map and queue*.
- **Endurecimiento de aislamiento de pruebas (test isolation hardening)** — checkpoint de seguridad/confiabilidad, no una funcionalidad de producto: se descubrió que una sesión de depuración había ejecutado suites e2e directamente (fuera del wrapper `npm test`), lo que las dejó apuntando por defecto al servidor de desarrollo real (puerto 4000) y escribiendo datos de prueba en la base de datos de desarrollo real (`delivery-app`) en vez de la base de datos de prueba aislada. Corregido en dos capas independientes (`backend/test/testSafety.js`): (1) `assertSafeTestBase()` rechaza el puerto 4000 antes de la primera petición HTTP, evaluado al cargar `helpers.js`; (2) un endpoint de identidad exclusivo para pruebas, `GET /health/test-identity` (solo existe cuando `TEST_MODE=true`, variable que únicamente pone `test/runTests.js` al levantar su propio servidor desechable — nunca un `npm run dev`/`npm start` normal), que `assertServerReachable()` consulta para exigir prueba de `env=test`, nombre de base de datos terminado en `_test`/`-test`, y puerto esperado antes de permitir que cualquier suite envíe una sola petición. `runTests.js` también valida sus propias variables `TEST_PORT`/`TEST_MONGO_URI` antes de arrancar y verifica la identidad del servidor que él mismo lanzó (no solo que "algo" responda en el puerto, cerrando el caso donde un proceso ajeno ya ocupa ese puerto). Se corrigió además la documentación de las 15 suites e2e existentes, que literalmente instruía "requiere el backend corriendo (`npm run dev`)" — la causa raíz documental del incidente. Nueva prueba de regresión determinista (`test/unit-test-harness-safety.js`, sin servidor ni base de datos) que prueba exactamente el escenario del incidente (puerto 4000, base de datos `delivery-app`) y confirma que se rechaza. De paso se corrigió también un flake de límite de medianoche, no relacionado, en `e2e-alerts.js` (`DRIVER_SHIFT_OVERRUN`), anclando su horario sintético para que nunca cruce la medianoche local, con el mismo principio ya usado en `e2e-driver-schedule.js`. **Commit:** `eb9a6f23959ebf78e90decf65c422d52f6c11332` — *harden test isolation and prevent dev database pollution*.
- **Route Planning Foundation** — la siguiente capa sobre Dispatch/Mapa Operativo, explícitamente sin elegir todavía un proveedor de mapas/geocodificación pago (sin API key nueva, sin `react-native-maps`, sin recompilación nativa). Normalización de destino: nuevo campo `originalAddress` (capturado una sola vez al crear, nunca tocado por correcciones posteriores — `address` sigue siendo el valor actual/mostrado, sin renombrar ni duplicar ese campo) con compatibilidad hacia atrás vía fallback a `address` para registros existentes que no lo tienen; `coordinateSource` (`'MANUAL'` | `'NONE'`, con `'GEOCODED'` como valor futuro natural) es deliberadamente **no persistido** — se deriva en `withMapsUrl()` al leer, igual que `mapsUrl` mismo, porque hoy es 100% derivable de si hay coordenadas o no. Reordenamiento de ruta server-autoritativo (`PATCH /dispatch/route-order`, body `{driver, orderedIds}`): el conjunto enviado debe coincidir **exactamente** con los dispatches activos (`PENDING`/`ACCEPTED`) actuales de ese chofer — ni de más ni de menos — lo que resuelve de una sola vez duplicados, ids faltantes, dispatches de otro chofer y dispatches en estado terminal (todos caen en la misma validación de "conjunto no coincide", sin mutación parcial posible porque toda la validación ocurre antes de cualquier escritura). Orden resultante siempre contiguo (`1..N`) sobre exactamente el conjunto validado. Nuevo modelo de lectura por chofer (`GET /dispatch/route-summary?driver=`): paradas activas en orden, conteo honesto de paradas con/sin coordenadas, y **nunca** distancia/tiempo estimado (no existe motor de ruteo). Enlace determinista "Abrir ruta en mapas" (`routeMapsUrl`) usando el esquema de URL de direcciones de Google (`?api=1&destination=...&waypoints=...`, sin API key, mismo principio que `mapsUrl`) — cada parada usa sus coordenadas si existen, si no su dirección de texto; sin origen fijo, para que la app de mapas use la ubicación actual del chofer. Contrato de optimizador futuro definido pero **sin implementar** (`backend/src/modules/dispatch/routeOptimizer.js`, exporta `optimizeRoute({origin, stops})` que lanza un error explícito) — no conectado a ninguna ruta. Auditoría nueva: `DISPATCH_ROUTE_REORDERED`, un solo evento por reordenamiento (`entity: 'DispatchRoute'`, `entityId` = el chofer, ya que el cambio es sobre la ruta completa, no sobre un `Dispatch` individual) con orden anterior/nuevo completos, no ruido por parada. UI: `admin/map.js` ("Mapa operativo") extendido con una sección "Ruta ordenada" cuando se selecciona un chofer específico — controles de subir/bajar (sin drag-and-drop; ver "DECISIONES ARQUITECTÓNICAS"), conteo de coordenadas visible, "Guardar orden" solo habilitado con cambios sin guardar, "Abrir ruta en mapas" deshabilitado mientras haya cambios sin guardar (para nunca abrir una ruta desactualizada). Verificado en vivo en navegador de escritorio y en un layout forzado a ~360px.

**Último HEAD committeado verificado:** `eb9a6f23959ebf78e90decf65c422d52f6c11332` — *harden test isolation and prevent dev database pollution*.

**Estado de implementación local (sin commit todavía):** Route Planning Foundation — completado y probado sobre ese HEAD (suite completa en verde, incluyendo el nuevo archivo de pruebas `e2e-dispatch-route-planning.js`; verificación en vivo en navegador confirmada, datos de prueba limpiados de la base de datos de desarrollo después). No se ha creado ningún commit para este trabajo; `eb9a6f2` sigue siendo el único HEAD verificado en el historial de git. Cuando se haga el commit, este documento debe actualizarse con el hash real — no se inventa uno aquí de antemano.

---

## DECISIONES ARQUITECTÓNICAS

Decisiones vigentes, actuales al checkpoint anterior:

- **Configuración contiene la configuración administrativa persistente** (Choferes, Horarios, Reabastecimiento) — cosas que un manager configura una vez y revisita ocasionalmente, no herramientas operativas del día a día.
- **Mensajería y Dispatch siguen siendo flujos operativos, no elementos de Configuración.** Permanecen accesibles directamente desde la navegación propia del dashboard del manager, porque se usan continuamente durante la operación diaria, no se configuran una vez y se dejan quietas.
- **Los módulos siguen separados por dominio de negocio**, exactamente según el principio original de la Sección 2 — un módulo solo llega a otro a través de su `*.service.js`, nunca accediendo directamente al modelo de otro módulo. Esto se ha mantenido para cada módulo agregado desde el plan original (`workShifts`, `driverSchedule`, `accountingPeriods`, `promotions`, `vehicles` incluidos).
- **AuditLog sigue siendo el único mecanismo de auditoría compartido.** Cada dominio nuevo que necesitó registro de auditoría (gestión de choferes, programación, mensajería, dispatch) se conectó al `audit.service.logChange()`/modelo `AuditLog` existente, en vez de inventar un log específico de dominio.
- **No crear sistemas de auditoría/registro paralelos.** Instrucción explícita, repetida en distintos checkpoints — se mantiene como restricción dura de aquí en adelante.
- **Evitar nuevos roles de usuario innecesarios hasta que el flujo realmente lo requiera.** `ROLES` sigue teniendo exactamente `driver`/`manager`/`admin`, sin cambios desde el plan original, a pesar de que se agregó funcionalidad sustancial nueva (programación, dispatch, gestión de choferes) sin necesitar un rol nuevo.
- **Alertas no fija un orden de escalamiento ni un canal de entrega.** `AlertRule` solo define condición/severidad/umbrales; cómo y a quién se notifica (push, SMS, WhatsApp, email, escalamiento) queda deliberadamente fuera de este checkpoint y debe poder conectarse después sin rediseñar `AlertRule`/`OperationalAlert`.
- **AuditLog registra acciones humanas, no el ciclo de vida generado por máquina.** Para Alertas específicamente: cambios de regla y reconocimiento sí se auditan (`ALERT_RULE_UPDATED`, `ALERT_ACKNOWLEDGED`); la creación/re-disparo/resolución automática de una alerta no, porque esa información ya vive de forma nativa en el propio `OperationalAlert` (`firstTriggeredAt`/`lastTriggeredAt`/`resolvedAt`) — duplicarla en AuditLog sería ruido, no señal.
- **Dispatch sigue siendo la única fuente de verdad para destinos/direcciones.** No se creó un dominio de "pool de direcciones" separado para Mapa Operativo — el pool `UNASSIGNED` es simplemente un filtro sobre `Dispatch`, no una entidad nueva.
- **Corrección de dirección actualiza el registro existente, nunca crea uno de reemplazo.** Un `Dispatch` representa una parada física continua incluso si su dirección se corrige después de asignado — el historial de auditoría, no un registro duplicado, es lo que preserva el rastro del cambio.
- **No se agrega una librería/canvas de mapa real (`react-native-maps`, Leaflet, Mapbox) ni un proveedor de geocodificación sin aprobación explícita**, por el costo de recompilación nativa y, en Android, la dependencia de una API key paga de Google Maps. Mapa Operativo se implementó como vista de tablero/lista (`admin/map.js`) que delega la geografía real a `mapsUrl`/`openInMaps`, precisamente para no forzar esa decisión de proveedor antes de tiempo.
- **`routeOrder` en `Dispatch` es un campo de preparación, no una función.** Existe para que una futura optimización de rutas tenga dónde escribir sin rediseñar el modelo, pero nada lo reordena todavía — asignar solo le da un valor creciente por chofer.
- **Un `Dispatch` no representa solo una dirección: representa una visita de venta potencial**, aunque el checkpoint actual solo modela su ciclo de vida logístico (asignación/estado/corrección). El resultado de la visita (venta o no-venta) es la extensión planificada inmediatamente siguiente — ver "SIGUIENTE FASE PLANIFICADA".
- **El harness de pruebas debe probar la identidad del servidor, no solo que "algo" responda.** Liveness (`/health` responde 200) nunca fue suficiente — un servidor de desarrollo real también responde. `/health/test-identity` (solo existe con `TEST_MODE=true`) es la fuente de verdad; cualquier suite que hable por HTTP debe verificarla antes de la primera petición real.
- **Un reordenamiento de ruta se valida como conjunto completo, nunca campo por campo.** El cliente debe enviar exactamente los ids activos actuales del chofer, en el orden deseado; cualquier discrepancia (faltante, sobrante, de otro chofer, terminal) se rechaza como una sola condición ("el conjunto no coincide"), no como validaciones separadas — esto es lo que garantiza que no hay mutación parcial posible ante un payload obsoleto.
- **`coordinateSource` es derivado, no almacenado** — mismo principio que `mapsUrl`/`isStale`: si un valor se puede calcular con certeza a partir de otros campos en el momento de leer, no se persiste por separado (evita que quede desincronizado de la fuente real).
- **El enlace multi-parada "Abrir ruta en mapas" sigue exactamente el mismo principio que `mapsUrl`**: una URL determinista sin proveedor/API key, nunca una llamada a una API de routing real. No es optimización de ruta — solo abre las paradas, en el orden ya decidido, en la app de mapas del dispositivo.
- **`routeOptimizer.js` define un contrato sin implementación** — deliberado. Ninguna ruta/controlador lo invoca todavía; existe solo para que una futura optimización real (determinista, VRP) tenga una forma acordada de antemano sin tener que rediseñar Dispatch cuando llegue.
- **Reordenamiento manual usa controles de subir/bajar, no drag-and-drop**, en este checkpoint — de proceso, no de plataforma: RN-Web no trae drag-and-drop nativo sin una dependencia adicional, y subir/bajar funciona igual de bien mobile-first (incluyendo ~360px) sin ese riesgo/costo. Drag-and-drop en web queda como posible mejora futura, no una limitación permanente.

---

## SIGUIENTE FASE PLANIFICADA

**Resultado de visita + Vinculación Venta ↔ Dispatch.**

Mapa Operativo + Cola de Dispatch (antes documentado en esta sección) ya está implementado — ver "IMPLEMENTADO / CERRADO" arriba. Con ese checkpoint cerrado, el siguiente paso del roadmap acordado con el usuario es cerrar el ciclo de vida de cada `Dispatch` con un resultado explícito de la visita, aún sin empezar:

- Un `Dispatch` representa una **visita de venta potencial**, no solo una dirección a la que llegar. Toda parada servida eventualmente necesita un resultado: `SALE` o `NO_SALE`.
- **`SALE`**: vincular explícitamente la `Sale` concreta con el `Dispatch` concreto — nunca inferir la vinculación a partir de una venta no relacionada que ocurrió cerca en tiempo/chofer. Una visita exitosa puede completar/retirar el `Dispatch` del pool activo.
- **`NO_SALE`**: no crear una `Sale` falsa de $0 para representar una visita sin venta. Guardar un motivo estructurado más un comentario opcional. Motivos sugeridos: `CUSTOMER_ABSENT`, `CUSTOMER_DECLINED`, `LOCATION_CLOSED`, `CANNOT_ACCESS`, `PRODUCT_UNAVAILABLE`, `OTHER` — con etiquetas en español en la UI.
- Tanto `SALE` como un `NO_SALE` legítimo cierran la visita activa preservando el historial (no se borra el `Dispatch`, se marca su resultado).
- Estos datos deben habilitar más adelante: conteo de visitas, ventas exitosas, visitas sin venta, tasa de conversión, motivos de no-venta agregados, desempeño por chofer y, después, desempeño geográfico/temporal/por ruta.
- No construir todavía — este es el registro de intención para cuando se aborde como su propio checkpoint, no una autorización para empezar ahora.

---

## PENDIENTE / BACKLOG

Preservado explícitamente, no descartado, no iniciado. (Resultado de visita + Vinculación Venta ↔ Dispatch se movió a "SIGUIENTE FASE PLANIFICADA" arriba.)

- **Mapa con canvas geográfico real** — Mapa Operativo se implementó como vista de tablero/lista (`admin/map.js`), no como un mapa renderizado; sigue pendiente integrar una librería de mapas nativa una vez que se apruebe esa dependencia (ver "DECISIONES ARQUITECTÓNICAS" arriba). Vista de historial de recorrido (`LocationPing` ya guarda cada ping, no solo el último, así que sería una consulta nueva, no un cambio de modelo) tampoco se ha construido.
- **Proveedor de geocodificación/routing** — seleccionar e integrar el proveedor adecuado para convertir texto de dirección en lat/lng automáticamente; requisito para un mapa verdaderamente "map-first". No elegir un proveedor pago sin aprobación. Depende de que Resultado de visita esté resuelto primero, según el orden de roadmap acordado con el usuario.
- **Optimización y asignación automática de rutas** — usar un algoritmo determinista de Vehicle Routing Problem (VRP), no un LLM. El contrato de entrada/salida ya está definido y sin implementar en `backend/src/modules/dispatch/routeOptimizer.js` (`optimizeRoute({origin, stops})`, checkpoint de Route Planning Foundation) — la reordenación manual (`PATCH /dispatch/route-order`) ya existe y seguirá disponible siempre, aditiva a cualquier optimización futura, nunca reemplazada por ella. Primera UX planeada: "Sugerir distribución" (el sistema propone asignaciones de chofer, orden de paradas, distancia/tiempo estimado) seguido de "Aplicar distribución" tras revisión del manager. Fases posteriores podrían agregar rebalanceo automático/dinámico.
- **Eventos geográficos + alertas de proximidad/movimiento** — tras la base de routing, eventos server-autoritativos usando `LocationPing` + coordenadas de `Dispatch`: `DRIVER_NEAR_DESTINATION`, `DRIVER_ARRIVED_AT_DESTINATION`, `DRIVER_STOPPED_TOO_LONG`, `DRIVER_STOPPED_AWAY_FROM_ASSIGNED_DESTINATION`, `DRIVER_LEFT_DESTINATION_WITHOUT_COMPLETING`. No todo evento se vuelve una `OperationalAlert` (ej. `DRIVER_NEAR_DESTINATION` es estado operativo normal; `DRIVER_STOPPED_TOO_LONG` podría ser `WARNING`; `DRIVER_STOPPED_AWAY_FROM_ASSIGNED_DESTINATION` podría ser `WARNING`/`CRITICAL`). Reutilizar la arquitectura de Alertas ya existente, no inventar una paralela. No inferir "detenido" a partir de un solo `LocationPing` — requiere múltiples observaciones/ventana de tiempo. La vista de chofer seleccionado en el mapa eventualmente debería mostrar ubicación actual, frescura, turno, próxima parada, distancia a destino, conteo de paradas, duración detenido y estado de proximidad/llegada — no fabricar esos valores antes de que exista el soporte de backend real.
- **Rebalanceo dinámico de asignaciones** — fase posterior a la optimización inicial; reasignar automáticamente según condiciones cambiantes, no solo en el momento de "Sugerir/Aplicar distribución".
- **Pulido final del flujo operativo real** — última fase del roadmap acordado, después de que routing/optimización/eventos geográficos estén implementados.
- **Zona peligrosa** (la futura área de Configuración para acciones destructivas/peligrosas — deliberadamente no construida en ningún checkpoint hasta ahora).
- **Brechas operativas/de conteo semanal que aún quedan** — el tipo de conteo `WEEKLY` y su flujo disparado por el manager existen según el diseño original de la Sección 7, pero el pulido de punta a punta ahí no se ha revisado desde entonces.
- **Revisión final del flujo operativo completo del manager** — un recorrido completo del día a día del manager a través de todos los módulos juntos, no módulo por módulo.
- **Pulido de UI/UX** — heredado del alcance original de la Fase 5; buena parte del pulido ya se aplicó de forma incremental (dashboard de administración, Programación, gestión de choferes, Configuración, Mensajería/Dispatch, Alertas, Mapa Operativo), pero algunas pantallas más antiguas (ej. `weekly-report`, `accounting-periods`, `promotions`) no se han revisado con el sistema visual actual.
- **Ítems de búsqueda/filtro/frescura/manejo de errores de la Fase 5 original** — siguen abiertos; ver la descripción original de la "Fase 5" en la Sección 10 más abajo.
- **Mecanismos de entrega externos para Alertas (y futuras notificaciones push / integraciones de mensajería externas en general)** — el punto de extensión del plan original (`messaging`/`dispatch` como "el lugar natural para enchufar Expo push") sigue vigente; ahora también aplica a `AlertRule`, diseñado explícitamente para aceptar un canal de entrega después sin rediseño. Push/SMS/Twilio/WhatsApp Business/email siguen sin implementar — incluida la notificación de corrección de dirección de Mapa Operativo, que hoy solo usa mensajería in-app.
- **`REPLENISHMENT_REQUEST_PENDING_TOO_LONG`** — regla de alerta considerada y diferida en el checkpoint de Alertas (ver "Registro de cambios" abajo); revisar si sigue teniendo valor operativo claro una vez que el flujo de tickets tenga más uso real.
- **Futuro flujo de almacén/proveedor, si se necesita** — no existe rol de almacén ni de fulfillment; no se construye por adelantado sin una necesidad real.

---

## Registro de cambios / Adiciones de alcance

Registro continuo de adiciones al alcance solicitadas por el usuario, más allá del plan original. Más recientes primero.

| Fecha | Adición | Estado |
|---|---|---|
| 2026-08 | Integración de AuditLog en Mensajería + Dispatch (`MESSAGE_SENT/READ`, `DISPATCH_CREATED/ACCEPTED/COMPLETED/CANCELLED`) | ✅ Completo |
| 2026-08 | Consolidación de Mensajería + Dispatch (restyle neo-brutalista, etiqueta de referencia opcional en dispatch, flag `important` en mensajes, expansión de detalle del historial de dispatch del chofer) | ✅ Completo |
| 2026-08 | Configuración reestructurada como landing de categorías (Choferes / Horarios / Reabastecimiento) con navegación de regreso consistente | ✅ Completo |
| 2026-08 | Módulo de Gestión de Choferes (CRUD completo, verificación de referencias antes de borrar, acciones de auditoría `DRIVER_*`) | ✅ Completo |
| 2026-08 | Subsistema de programación de choferes (`defaultShift`, `DriverScheduleException`, `ScheduledShift`, resolución determinista, estado en vivo) | ✅ Completo |
| 2026-08 | Rediseño del dashboard de administración (sistema visual neo-brutalista) | ✅ Completo |
| — | Módulo de Promociones (precios por paquete `QUANTITY_FOR_PRICE`) | ✅ Completo |
| — | Módulo de Periodos Contables | ✅ Completo |
| 2026-08-29 | Tickets de solicitud de reabastecimiento (modelo `ReplenishmentRequest`, máquina de estados, snapshot de producto, texto para compartir, AuditLog completo, pestaña "Solicitudes" en `admin/settings/replenishment.js`) | ✅ Completo |
| 2026-08-30 | Protección de referencia de producto para `ReplenishmentRequest` (un producto referenciado por un ticket no puede borrarse en definitivo, vía servicio, no modelo directo) | ✅ Completo |
| 2026-08-30 | Alertas: `AlertRule`/`OperationalAlert`, 5 reglas (`DRIVER_LATE_START`, `DRIVER_SHIFT_OVERRUN`, `LOCATION_STALE`, `LOW_INVENTORY`, `PENDING_APPROVAL_TOO_LONG`), evaluación idempotente con dedupe + auto-resolución, reconocimiento, `Configuración → Alertas` + pantalla operativa `Alertas` + integración en el dashboard | ✅ Completo |
| 2026-08-30 | Regla de alerta `REPLENISHMENT_REQUEST_PENDING_TOO_LONG` | ⏸️ Considerada y diferida — el flujo de tickets es muy reciente y de un solo actor (el propio manager marca los estados); sin un caso de uso real todavía que demuestre que hace falta una alerta para "se te olvidó tu propio borrador/envío". Revisar más adelante con uso real. |
| 2026-08-30 | Mapa Operativo + Cola de Dispatch (estado `UNASSIGNED`, creación/asignación/reasignación individual y en lote server-autoritativas, `routeOrder` de preparación, corrección de dirección en vivo con limpieza de coordenadas obsoletas y notificación in-app al chofer, auditoría `DISPATCH_ASSIGNED/REASSIGNED/DESTINATION_UPDATED`, pantalla `admin/map.js` tipo tablero/lista en vez de canvas de mapa real) | ✅ Completo — commit `2b510b9c` |
| 2026-08-30 | Endurecimiento de aislamiento de pruebas: endpoint de identidad `/health/test-identity` solo en modo prueba, guardas fail-closed de puerto/base de datos en `test/testSafety.js`, corrección de la documentación de las 15 suites e2e que instruía incorrectamente `npm run dev`, prueba de regresión determinista, y corrección de un flake de medianoche en `e2e-alerts.js` | ✅ Completo — commit `eb9a6f23` |
| 2026-08-31 | Route Planning Foundation: normalización de destino (`originalAddress`/`coordinateSource`), reordenamiento de ruta server-autoritativo por conjunto exacto (`PATCH /dispatch/route-order`), modelo de lectura `GET /dispatch/route-summary`, enlace determinista multi-parada "Abrir ruta en mapas" (sin proveedor/API key), contrato `routeOptimizer.js` sin implementar, auditoría `DISPATCH_ROUTE_REORDERED`, UI de reordenamiento subir/bajar en `admin/map.js` | ✅ Completo — pendiente de commit |

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

### 3.3 Módulos añadidos después del plan original

Las secciones 3.1 y 3.2 arriba son el árbol **original**, tal como se diseñó. La estructura real de `backend/src/modules/` hoy incluye, además de los 13 módulos listados en 3.1:

- `accountingPeriods/` — periodos contables.
- `driverSchedule/` — `DriverScheduleException` (excepciones de horario por fecha).
- `promotions/` — promociones tipo "cantidad por precio" sobre productos.
- `scheduledShifts/` — `ScheduledShift` (turnos explícitos programados).
- `vehicles/` — antes solo un campo suelto en `User`, ahora un módulo completo (CRUD + asociación con chofer).
- `workShifts/` — concepto nuevo, no contemplado en el plan original: fichaje de entrada/salida del chofer, independiente de las sesiones de inventario.

Del lado de `app/app/`, las rutas reales bajo `(admin)` también crecieron más allá de 3.2: existen subcarpetas `admin/drivers/`, `admin/settings/`, además de `admin/schedule.js`, `admin/messages.js`, `admin/dispatch.js`, `admin/product/[id].js`, `admin/promotion/[productId].js`, y `admin/sale/[id].js`. El árbol de rutas dejó de ser plano (`(admin)/*.js`) y ahora anida por sub-dominio donde tiene sentido (ej. detalle de un producto o una venta por id).

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

> **Nota (checkpoint `686772f`):** el modelo y el mecanismo (`logChange`/`getHistory`) no cambiaron. El `action` enum sí creció mucho más allá de las 5 acciones de ejemplo de arriba — hoy cubre ~35 valores repartidos entre gestión de choferes (`DRIVER_CREATE/UPDATE/ACTIVATE/DEACTIVATE/DELETE/DELETE_BLOCKED`), programación (`CREATE/UPDATE/DELETE_SCHEDULE_EXCEPTION`, `UPDATE_DEFAULT_SHIFT`), cierres (`CLOSING_SUBMITTED/REOPENED/FINALIZED`), turnos (`START_SHIFT/END_SHIFT`, `ADMIN_EDIT_SHIFT/ADMIN_CLOSE_SHIFT`), reabastecimiento, y ahora mensajería/dispatch (`MESSAGE_SENT/READ`, `DISPATCH_CREATED/ACCEPTED/COMPLETED/CANCELLED`). Sigue siendo el único mecanismo de auditoría del proyecto — ningún módulo nuevo creó su propio log paralelo.

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

> **Nota (checkpoint `686772f`):** implementado con un tercer estado, `REOPENED` — un manager puede devolver un cierre para corrección en vez de solo `OPEN`/`CLOSED`. No estaba en el diseño original.

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

> **Nota (checkpoint `686772f`):** se agregaron `subject: String` e `important: Boolean` (no estaban en el diseño original) para soportar el requerimiento de un flag opcional de prioridad en el composer del manager. El resto del modelo (sender/recipients/body/readBy) se implementó tal como se diseñó.

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

> **Divergencia real vs. plan (checkpoint `686772f`) — el ejemplo más claro de "la implementación superó el diseño original":** el plan original modelaba `Dispatch` como un broadcast de solo-lectura, estructuralmente idéntico a `Message` con una dirección adjunta (`sender`/`recipients`/`address`/`readBy`, sin estado). Lo implementado es un flujo operativo real con máquina de estados:
> ```js
> {
>   driver: ObjectId(User),          // un solo chofer asignado, no un broadcast a varios
>   vehicle: ObjectId(Vehicle),      // opcional, inferido del chofer si no se especifica
>   destinationLabel: String,        // opcional — referencia/cliente
>   address: String,
>   latitude: Number,                // opcional
>   longitude: Number,               // opcional
>   note: String,                    // instrucciones libres, excluidas del AuditLog
>   status: { type: String, enum: ['PENDING', 'ACCEPTED', 'COMPLETED', 'CANCELLED'] },
>   acceptedAt: Date,
>   completedAt: Date,
>   cancelledAt: Date,
>   cancelledBy: ObjectId(User),
>   createdBy: ObjectId(User),
> }
> ```
> `mapsUrl` se calcula al leer (no se guarda), igual que `isStale` en `LocationPing` arriba — mismo principio de "no persistir lo derivable". El chofer asignado controla `accept`/`complete` sobre su propio dispatch; solo el manager puede `cancel` (desde `PENDING` o `ACCEPTED`). Cada transición válida queda auditada (`DISPATCH_CREATED/ACCEPTED/COMPLETED/CANCELLED`).

`replenishment` **no tiene modelo propio todavía**: sigue siendo un servicio de cálculo que lee `Product`, `Sale` e `InventoryCount`, tal como se diseñó — ver "SIGUIENTE FASE PLANIFICADA" arriba para el plan de introducir `ReplenishmentRequest` como el primer modelo persistido de este módulo.

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

> **Nota (checkpoint `686772f`):** `dispatch` terminó siendo bastante más que "el mismo patrón que `messaging` con una dirección" — ver la divergencia documentada en el modelo `Dispatch` en la Sección 4. Es un flujo real de asignación-aceptación-entrega con estado propio por chofer, no un broadcast de solo lectura. `messaging` y `locations` sí se implementaron básicamente como se describe aquí (marcar-como-leído dejó de ser opcional: ahora alimenta el badge de no-leídos y el AuditLog `MESSAGE_READ`, pero el patrón de request es el mismo).

---

## 10. Fases de desarrollo

> Estado real de cada fase al checkpoint `686772f`, verificado contra el repositorio (no se retiran las descripciones originales — se anotan en línea):

**Fase 0 — Fundaciones** ✅ COMPLETADA
Backend base (Express + Mongoose + conexión DB), estructura de carpetas de todos los módulos (aunque vacíos), módulo `auth` (login + JWT + roles), módulo `users`, módulo `products` (CRUD simple). App Expo Router base con `(auth)`, `(driver)`, `(admin)`, login funcional.

**Fase 1 — Núcleo de ventas (MVP)** ✅ COMPLETADA
`sales` (crear venta, división de pago, validación de suma, ajuste con motivo), `approvals` (listar pendientes, modificar con auditoría, aprobar / cancelar / marcar incidente), `audit` (log genérico). Pantallas: `new-sale`, `my-sales` (chofer); `sales-pending` (manager).

**Fase 2 — Inventario y cierre** ✅ COMPLETADA
`inventory` (sesión inicial, cálculo de esperado), `inventoryCounts` (parcial, cierre, inicial), `closing` (conciliación de efectivo + inventario). Pantallas: `inventory-count` (chofer); `inventory`, `closings` (manager). *Ampliada:* `Closing` ganó el estado `REOPENED` (Sección 4).

**Fase 3 — Reabastecimiento y conteo semanal** ⚠️ PARCIAL
`replenishment` (servicio + endpoint) implementado tal como se diseñó, sin modelo propio. Conteo tipo `WEEKLY` implementado sobre `InventoryCount`. Pendiente: persistir tickets de reabastecimiento — ver "SIGUIENTE FASE PLANIFICADA" al inicio del documento.

**Fase 4 — Ubicación, mensajería y dispatch** ✅ COMPLETADA (con expansión significativa)
`locations`, `messaging`, `dispatch` implementados. `dispatch` se apartó del diseño original de "broadcast de solo lectura" y se implementó como un flujo real de asignación con máquina de estados (`PENDING`/`ACCEPTED`/`COMPLETED`/`CANCELLED`) — ver la nota de divergencia en el modelo `Dispatch`, Sección 4. Además, ambos módulos ganaron cobertura de `AuditLog` (`MESSAGE_SENT/READ`, `DISPATCH_CREATED/ACCEPTED/COMPLETED/CANCELLED`), deliberadamente diferida a un checkpoint posterior en vez de mezclarse con la implementación funcional inicial.

**Fase 5 — Pulido** ⚠️ PARCIAL
Parte de lo descrito aquí sí se hizo (manejo de errores consistente en los módulos nuevos, mejoras de UX en Configuración/Choferes/Horarios/Messaging/Dispatch). Pendiente: indicadores de frescura de ubicación en UI, filtros/búsqueda en listados del panel — ver "PENDIENTE / BACKLOG" al inicio del documento.

**Fase 6+ — Expansión no prevista en el plan original** (no existía como fase; se documenta aquí en vez de forzarla dentro de las fases 0–5)
Trabajo real que se hizo después de la Fase 5 original y que amplió el alcance del proyecto: `workShifts` (fichaje de entrada/salida, concepto nuevo), la subsistema completo de programación de choferes (`defaultShift`, `DriverScheduleException`, `ScheduledShift`, resolución determinista), gestión completa de choferes/vehículos (CRUD, activar/desactivar, borrado seguro con verificación de referencias), el dashboard de manager rediseñado (sistema visual "neo-brutalista"), la reestructuración de Configuración como landing de categorías (Choferes / Horarios / Reabastecimiento), y finalmente la consolidación + auditoría de Messaging/Dispatch documentada arriba. Ver "Registro de cambios / Adiciones de alcance" al inicio del documento para el registro detallado.

---

## 11. MVP vs. siguiente iteración

> Esta priorización fue la guía real seguida durante el desarrollo y las Fases 0–4 aquí descritas están completas (ver anotaciones en la Sección 10). El estado de ejecución vigente vive en "IMPLEMENTADO / CERRADO" al inicio del documento; esta sección se conserva porque explica el *razonamiento* detrás del orden elegido, que sigue siendo válido.

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

**Fin del plan original.** Todo lo anterior a este punto se conserva como registro histórico de la arquitectura e intención con la que arrancó el proyecto. El estado real de ejecución — qué está construido, qué se amplió respecto a este diseño, y qué sigue pendiente — vive en las secciones "IMPLEMENTADO / CERRADO", "DECISIONES ARQUITECTÓNICAS", "SIGUIENTE FASE PLANIFICADA", "PENDIENTE / BACKLOG" y "Registro de cambios / Adiciones de alcance" al inicio del documento. Último HEAD committeado verificado: `de8a6ca` (2026-08-30) — ver la nota de "Estado de implementación local" al inicio del documento para el trabajo ya completado pero aún sin commit sobre ese HEAD.
