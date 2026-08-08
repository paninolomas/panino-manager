# Panino Manager

Copiloto gerencial para Panino. Fase 1: base de datos, autenticación, roles,
cuentas y movimientos, proveedores, gastos, ventas básicas, auditoría.

## Stack

Next.js (App Router) + TypeScript · Supabase (Postgres + Auth + RLS) · Vercel · Vitest.

## Requisitos

- Node 20+
- [Supabase CLI](https://supabase.com/docs/guides/cli) (para desarrollo local con Docker) o un proyecto de Supabase ya creado.

## Puesta en marcha (desarrollo local con Supabase CLI)

```bash
npm install

# Levanta Postgres + Auth local en Docker y aplica supabase/migrations + seed.sql
supabase start
supabase db reset

cp .env.example .env.local
# Completar NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY
# con los valores que imprime `supabase start` (API URL / anon key)

npm run dev
```

Abrir http://localhost:3000.

### Crear el primer usuario (socio)

**No existe registro público de usuarios.** Los usuarios se crean administrativamente
vía Supabase Auth (Sección 9 de Fase 1.1) — nunca por un formulario de signup expuesto
en la aplicación. Desde Fase 1.1, el rol y la ubicación de un usuario nuevo **no** se
toman de lo que el usuario declare al registrarse (eso era un agujero de seguridad real:
en un proyecto con signup público habilitado, cualquiera podía pasar `role: "socio"` en
sus propios metadatos). Todo alta nueva entra como `empleado` de la única ubicación
existente; promover a socio es una acción manual en la base.

Con el proyecto local corriendo:

1. Abrir Supabase Studio local (URL que imprime `supabase start`, normalmente http://localhost:54323).
2. Authentication → Add user → completar email/password. **No hace falta** cargar `user_metadata` con `role` — se ignora a propósito.
3. El trigger `on_auth_user_created` crea automáticamente el `profile` con `role = 'empleado'`.
4. Para convertir a ese usuario en socio, correr en el SQL editor:
   ```sql
   update profiles set role = 'socio' where id =
     (select id from auth.users where email = 'el-email-que-usaste@panino.com');
   ```

Repetir el paso 1-3 (sin el paso 4) para las cuentas del equipo (quedan como `empleado`).

**Recomendación de configuración del proyecto real de Supabase**: en Authentication →
Settings, deshabilitar "Enable email signup" (o equivalente) para que no exista alta
pública de cuentas en absoluto — el paso 1-3 de arriba se hace desde el panel de
administración, no desde un formulario público. Esto es defensa en profundidad además
del hardening de `handle_new_user()`: aunque el signup público quedara habilitado por
error, un usuario nuevo solo obtiene `empleado` sin acceso financiero, nunca `socio`.

## Puesta en marcha (proyecto real de Supabase, sin Docker)

```bash
npm install
supabase link --project-ref <tu-project-ref>
supabase db push        # aplica las migraciones al proyecto remoto
# ejecutar supabase/seed.sql manualmente desde el SQL editor del proyecto (una vez)

cp .env.example .env.local
# completar con la URL/anon key del proyecto (Project Settings → API)

npm run dev
```

## Tests

Dos niveles:

- **`npm test`** — motor financiero (funciones puras, sin base de datos) +
  chequeo estático de que las guardas de Fase 1.1 quedaron efectivamente
  escritas en las migraciones. Corre en cualquier entorno, sin Docker.
- **Tests de integración de seguridad e integridad financiera**
  (`tests/integration/rls.test.ts`, `tests/integration/financial-integrity.test.ts`) —
  requieren Postgres real (Supabase local vía Docker). Estos NO corren con
  `npm test` en un entorno sin esa infraestructura: quedan en `skip` automático
  si faltan las variables de entorno `SUPABASE_TEST_*`. Cada archivo trae en su
  encabezado el paso a paso completo para levantarlos. **No fueron ejecutados
  en el entorno de desarrollo de este repositorio** por no tener Docker
  disponible — están escritos y listos para correr apenas exista Supabase
  local, no simulados.

```bash
npm test
```

## Regenerar tipos de la base de datos

`lib/supabase/database.types.ts` está escrito a mano para Fase 1/1.1 (no hay
un proyecto Supabase real linkeado desde este entorno de desarrollo, así que
no se pudo generar automáticamente). El **schema SQL en `supabase/migrations/`
es la fuente de verdad** — este archivo de tipos es un stand-in que puede
quedar desactualizado si el schema cambia sin regenerarlo.

1. Crear o abrir el proyecto de Supabase real (`supabase.com` → New Project, o el que ya tengas).
2. Linkear el repo local: `supabase link --project-ref <tu-project-ref>`.
3. Aplicar las migraciones al proyecto: `supabase db push`.
4. Regenerar los tipos: `npm run types:generate` (corre `supabase gen types typescript --linked`).

Ejecutar el paso 4 **cada vez que se agregue o modifique una migración** — no
editar `database.types.ts` a mano una vez que existe un proyecto real
linkeado. Los clientes de Supabase (`lib/supabase/server.ts` y `browser.ts`)
no pasan el genérico `Database<>` todavía (ver comentario en esos archivos);
una vez regenerado el archivo con el shape completo que espera
`@supabase/supabase-js`, se puede volver a agregar `createServerClient<Database>(...)`
sin los problemas de inferencia que motivaron sacarlo.

## Deployment (Vercel)

1. Conectar el repositorio de GitHub en Vercel.
2. Configurar `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` en
   Project Settings → Environment Variables (mismos valores que `.env.local`,
   pero del proyecto de Supabase de producción, no el local).
3. Push a `main` → deploy automático. Pull requests generan preview deployments.

No hace falta infraestructura adicional (sin servidor propio, sin contenedores).

## Decisiones de Fase 1 que conviene recordar

- **`cash_movements` es insert-only.** Ningún saldo se edita directo; toda
  escritura pasa por las funciones RPC de `supabase/migrations/0011_rpc_functions.sql`
  (cuerpos de `reverse_movement`, `transfer_between_accounts` y `record_sale`
  actualizados en `0014_rpc_hardening.sql` durante Fase 1.1).
- **RLS es la seguridad real**, no la UI. Ver `0010_rls_policies.sql` y la tabla
  `role_permissions` (módulo × rol × can_read/can_write).
- **No hay `SUPABASE_SERVICE_ROLE_KEY` ni `ANTHROPIC_API_KEY`** en esta fase —
  deliberado, ver `.env.example`.
- El motor financiero de esta fase es mínimo (saldo derivado + liquidez total +
  comprometido simple, sin horizonte ni reserva). El motor completo es Fase 2.

## Fase 1.1 — hardening (ver migraciones 0012-0016)

- Los empleados ven productos vía la función `sales_products()` (nunca la
  tabla `products` directo) — así nunca reciben `current_cost`, aunque
  compartan el mismo rol de Postgres que los socios.
- `reverse_movement` y `transfer_between_accounts` ahora validan `location_id`
  explícitamente (antes de 1.1, `reverse_movement` no lo hacía).
- `record_sale` valida canal habilitado, al menos un item, cantidades/precios
  válidos, y que cada producto exista/esté activo/pertenezca a la ubicación
  del usuario — todo dentro de la RPC, no solo en el Zod del frontend.
- Los altas nuevas de usuario **siempre** entran como `empleado`; el rol nunca
  se toma de lo que el usuario declare en el signup (ver `0015`).
- El grant amplio `GRANT EXECUTE ... TO authenticated` sobre todas las
  funciones fue reemplazado por grants explícitos por función (`0016`).

## Fase 2 — motor financiero completo (ver migraciones 0017-0023)

- **Liquidez por horizonte** (hoy / 3 / 7 / 14 / 30 días), en
  `lib/services/financial-engine.ts` (`buildStandardHorizonProjections`),
  visible en el dashboard. Combina caja actual + cobros esperados (settlements
  pendientes) − comprometido (obligaciones + comisiones + gastos recurrentes
  proyectados) − reserva mínima.
- **Liquidaciones (settlements)** reales para PedidosYa/Rappi: `generate_settlement`
  agrupa ventas sin liquidar de un período en una liquidación con comisión y
  monto neto calculados; `collect_settlement` registra el cobro efectivo.
  Página `/settlements`.
- **Comisión de Pedix**: `record_sale` ahora genera automáticamente una
  `commission_charge` pendiente cuando el canal es Pedix (cobro íntegro,
  comisión diferida — tal como se definió explícitamente). `pay_commission`
  la liquida.
- **Simulador de adelanto de PedidosYa**: `simulatePedidosYaAdvance` +
  `recommendAdvanceDecision` son funciones puras (testeadas); nunca aplican
  una regla fija de "siempre/nunca adelantar" — comparan el costo contra el
  disponible proyectado antes de la fecha de cobro normal. El resultado se
  persiste vía `record_advance_decision` para trazabilidad (Sección 43 del
  prompt original: toda recomendación debe poder explicarse).
- **Reserva mínima configurable** vía `set_reserve_target` (RPC atómica: cierra
  la vigente y abre la nueva en la misma transacción).
- **Placeholders de comisión por canal** (`0019`): los porcentajes de comisión
  de PedidosYa/Rappi/Pedix se cargaron con valores de arranque explícitamente
  marcados como `AJUSTAR` — no son datos reales de Panino, son necesarios
  para que `generate_settlement`/`record_sale` puedan operar. **Reemplazar
  antes de usar el sistema para decisiones reales** (`channel_cost_items`,
  editable por SQL o, a futuro, por una pantalla de configuración).
- Fuera de alcance de Fase 2 (documentado, no implementado): descuentos y
  ajustes de plataforma dentro de una liquidación (quedan en 0), integración
  real con las APIs de PedidosYa/Rappi/Pedix (siguen siendo carga manual vía
  "Ventas"), rentabilidad por producto/canal (Fase 3), stock (Fase 4),
  objetivos y simulador completo (Fase 5), Copiloto (Fase 6).

## Fase 3 — rentabilidad (ver migraciones 0024-0025)

Sin recetas todavía (eso es Fase 7 del roadmap post-MVP) — usa
`products.current_cost` como costo simple, tal como estaba definido para el
MVP.

- **Motor de rentabilidad puro** (`lib/services/profitability-engine.ts`, 16
  tests): precio neto, ganancia por unidad, margen %, ganancia total, y la
  distinción explícita que pedía el prompt original — *"mayor margen % no es
  lo mismo que la que más plata deja"* — con rankings separados
  (`rankByMarginPercent` vs. `rankByTotalProfit`).
- **Separación estricta cálculo/agregación**: `sales_summary_by_product_channel`
  (RPC) solo suma unidades e ingreso bruto — nunca calcula margen en SQL. El
  cálculo ocurre en `/api/profitability/generate` con el motor TS, y
  `insert_margin_snapshots` solo persiste lo ya calculado.
- **Snapshots de margen** (`margin_snapshots`) por producto × canal × período,
  generados explícitamente (botón "Recalcular", no automático) — permite
  comparar contra el período anterior.
- **Alertas de caída de margen**: `detectMarginDrops` compara el snapshot
  actual contra el anterior por producto/canal; la página `/profitability`
  muestra el aviso con la caída en puntos porcentuales cuando supera el
  umbral (2 puntos, mismo ejemplo que la Sección 13 del prompt original).
- **Precios por canal** (`set_channel_price`, atómico, versionado — mismo
  patrón que `set_reserve_target`) y **edición de costo de producto**
  (versionado automáticamente en `audit_log` vía el trigger ya existente de
  Fase 1).
- Corregí de paso un hueco de aislamiento por `location_id` en
  `channel_prices.select` que databa de Fase 1 (0010) y no se había tocado
  hasta ahora.
- Fuera de alcance de Fase 3 (documentado, no implementado): recetas/subrecetas
  e ingredientes (Fase 7), food cost/prime cost/CMV como indicadores separados
  (se puede derivar de `margin_snapshots` más adelante sin cambiar el schema),
  sugerencia automática de precio ante caída de margen, comparación de
  escenarios (eso es el simulador "qué pasa si" de Fase 5).

## Fase 4 — stock (ver migración 0026)

Sin recetas todavía (Fase 7) — el consumo diario se **estima desde el
historial de `stock_movements`** (salidas registradas manualmente: compra,
consumo, merma, ajuste), no desde ventas×receta. Cuando exista el sistema de
recetas, se puede agregar esa fuente de estimación sin cambiar el motor de
stock (`lib/services/stock-engine.ts`) — solo cambia de dónde sale
`DailyConsumptionEstimate`.

- **`stock_movements` es insert-only**, igual que `cash_movements`: el nivel
  de stock siempre se deriva de `SUM(entrada) - SUM(salida)`, nunca se edita
  directo. Reversión = movimiento compensatorio, con la misma protección
  contra doble reversión (índice único parcial + `unique_violation`
  capturado) que ya usamos para caja.
- **Regla "nunca inventar datos" aplicada literalmente**: con menos de 3 días
  distintos de historial de salida en la ventana de 14 días, la estimación de
  consumo devuelve `confidence: 'insuficiente'` y `value: 0` — nunca un
  número que parezca preciso sin serlo. La cobertura y la prioridad de
  compra respetan esa confianza (una sola salida enorme en un solo día no
  cuenta como "historial suficiente", aunque el número sea grande).
- **Compras recomendadas** con prioridad automática (alta/media/baja según
  días de cobertura, o "revisar" cuando no hay confianza suficiente — nunca
  se le asigna una urgencia inventada a un ítem sin historial).
- **Acceso de empleados**: a diferencia de los módulos financieros, el módulo
  `stock` da lectura y escritura a `socio` **y** `empleado` — así lo pedía
  explícitamente la Sección 33 del prompt original ("empleados: stock,
  compras, información operativa").
- Página `/stock`, visible para ambos roles.
- Fuera de alcance de Fase 4 (documentado, no implementado): vencimientos,
  rotación de stock, desperdicio como indicador separado del origin_type
  'waste' ya registrado, integración con el importador de facturas (Fase 6).

## Fase 5 — objetivos + simulador (ver migraciones 0027-0028)

### Objetivos
- **Progreso simple** (`calculateGoalProgress`): logrado, faltante, % de
  cumplimiento, días restantes, ritmo lineal de referencia — siempre
  calculable, sirve de piso.
- **Proyección ponderada por historial** (`projectGoalCompletion`), literal a
  la Sección 18 del prompt original: si el objetivo semanal es $6M y van
  $3.2M con 4 días restantes, **no se reparte linealmente** — se usa el
  promedio histórico de facturación por día de la semana (mínimo ~2 semanas
  de historial) para saber si, al ritmo real de cada día, el objetivo sigue
  siendo alcanzable. Sin historial suficiente, devuelve `confidence:
  'insuficiente'` y **no afirma nada** sobre si se llega o no — nunca una
  probabilidad inventada.
- **Alcance de la ponderación por historial**: solo la variable `facturacion`
  la tiene en Fase 5 (es la única con serie diaria confiable vía `orders`).
  Las demás variables (`ganancia`, `pedidos`, `ticket_promedio`, `margen`,
  `caja`, `ahorro`) sí calculan su "logrado" en tiempo real desde datos
  reales, pero la proyección de alcanzabilidad queda documentada como
  pendiente para ellas (ampliar `daily_sales_series` u homólogos).
- El valor logrado **no se guarda** en la tabla `goals` — se recalcula en
  cada visita desde `orders`/`cash_movements`/`sales_summary_by_product_channel`
  según la variable, para no tener que mantenerlo sincronizado.

### Simulador "¿qué pasa si?"
- `lib/services/simulation-engine.ts` reutiliza el motor de rentabilidad
  (precio neto, ganancia por unidad, margen) y agrega **punto de equilibrio**
  (`calculateBreakEvenUnits`, agregado al motor de rentabilidad — `null` si
  el producto no deja contribución positiva, nunca un número negativo
  engañoso).
- Variables y presets tal como pedía la Sección 16: precio (+5/+8/+10%),
  ventas (-10/0/+10/+20%), costos (+5/+10%), comisión (30/32/35%).
- **Corre 100% client-side** (el motor es TS puro, sin dependencias de
  servidor) — la comparación situación actual vs. simulada es instantánea,
  sin ida y vuelta al servidor, y no modifica ningún dato real.
- Página `/simulator`, precarga los costos fijos por defecto desde los
  gastos recurrentes activos.
- Fuera de alcance de Fase 5 (documentado, no implementado): comparar el
  resultado del simulador directamente contra un objetivo cargado (hoy se
  ven en páginas separadas), simulaciones de dotación de personal/turnos,
  guardar/nombrar escenarios simulados para comparar después.

## Fase 6 — Copiloto (ver `lib/copilot/`, `app/api/copilot/`)

- **La IA nunca calcula.** Cada una de las 8 herramientas (`get_cash_snapshot`,
  `get_pending_payments`, `get_pending_collections`, `simulate_pedidosya_advance`,
  `get_profitability_ranking`, `get_stock_recommendations`, `get_goal_progress`,
  `get_yesterday_summary`) es una llamada a un repositorio + un motor
  determinístico ya existente (financial/profitability/stock/goals-engine).
  El modelo solo puede citar lo que esas funciones devuelven en el turno
  actual — el system prompt se lo exige explícitamente, y hay tests estáticos
  que verifican que esa instrucción esté efectivamente en el prompt (no solo
  documentada acá).
- **`simulate_pedidosya_advance` nunca asume un % de adelanto** — si el
  usuario no lo dio, el prompt le exige al modelo preguntarlo antes de
  simular (mismo principio que veníamos sosteniendo desde Fase 1).
- **Solo lectura y simulación** — ninguna herramienta escribe en la base ni
  ejecuta una acción financiera real (pagar, cobrar, transferir, adelantar).
  El system prompt además le prohíbe al modelo dar a entender que ejecutó
  algo ("nunca digas que ya pagaste/cobraste/adelantaste"). Si en el futuro
  se agrega una herramienta de escritura, debe pedir confirmación explícita
  del usuario antes de correr — deliberadamente no implementado en Fase 6.
- **Solo socio** (`requireSocio()` en la página y en el route handler) —
  coherente con la Sección 39 del prompt original ("empleados NO deben
  acceder... al Copiloto financiero").
- **`ANTHROPIC_API_KEY` server-side únicamente**, nunca con prefijo
  `NEXT_PUBLIC_`. Sin la variable configurada, `/api/copilot` responde `503`
  con un mensaje claro en vez de romper.
- **Tope de iteraciones de tool-calling** (`MAX_TOOL_ITERATIONS = 6`) para
  que una pregunta ambigua no genere un loop costoso sin fin.
- **Transparencia**: cada respuesta del Copiloto en la UI muestra qué
  herramientas consultó para armarla (Sección 43 del prompt original — toda
  recomendación debe poder explicarse).
- No pude probar `/api/copilot` de punta a punta en este entorno (no hay
  Supabase local con sesión real ni `ANTHROPIC_API_KEY` configurada acá) —
  cubierto con tests estáticos sobre el system prompt y la estructura del
  código, documentado igual que el resto de las pruebas `NOT RUN`.

## Fase 7 — importación (ver migración 0029)

Sin archivos reales de Panino disponibles, el importador es **genérico**:
el usuario mapea columnas a mano en vez de asumir un layout fijo de
PedidosYa/Rappi/Pedix (tal como pedía explícitamente el prompt original —
"no inventar formatos").

- **Alcance: a nivel de pedido, no de línea.** Importa fecha, número de
  pedido, total, descuento y medio de pago por fila — no reconstruye el
  detalle de productos vendidos dentro de cada pedido (eso requeriría asumir
  una estructura de archivo con múltiples ítems por pedido que no podemos
  verificar sin un archivo real). Documentado como límite explícito, no
  oculto.
- **Parsing flexible** (`lib/services/import-engine.ts`, 18 tests): números
  en formato argentino (`1.234,56`) o internacional (`1,234.56`), fechas en
  varios formatos comunes. Encontré y corregí un bug real de la propia
  heurística durante el desarrollo (`"19.000"` se interpretaba como `19` en
  vez de `19000` — un solo punto con exactamente 3 dígitos después es casi
  siempre separador de miles en un monto, nunca 3 decimales de centavos).
- **Deduplicación real, no una consulta previa**: constraint único en
  Postgres (`location_id, channel_id, external_order_number`) — dos filas
  del mismo pedido, o dos importaciones del mismo archivo por error, nunca
  generan una venta duplicada, incluso bajo concurrencia.
- **No bloquea el archivo completo**: cada fila se valida independiente
  (`ok` / `warning` / `error` / `duplicate`), el resumen final muestra
  cuántas de cada una y el % identificado.
- **Mapeo de columnas reutilizable** por canal (`column_mapping_templates`,
  ya existía la tabla desde Fase 1 sin uso — ahora tiene RLS real y se
  guarda/recupera desde la UI).
- Gap documentado a propósito: `import_order` no genera automáticamente la
  `commission_charge` de Pedix (a diferencia de `record_sale`) ni reconstruye
  `order_items` — si se importan ventas de Pedix, la comisión pendiente hay
  que cargarla o ajustarla manualmente por ahora.
- Página `/imports`, solo socio.

## Fix post-producción — recursión infinita en RLS de `profiles` (ver migración 0030)

Primer bug real encontrado al correr las migraciones contra un Postgres real
(todo lo anterior solo se había validado con tests estáticos sobre el texto
del SQL). La policy `"socio ve profiles de su ubicación"` (0010)
subconsultaba `profiles` directamente dentro de su propio `USING` —
Postgres, al evaluar esa policy, vuelve a aplicar RLS sobre esa subconsulta,
que dispara la misma policy de nuevo: `ERROR 42P17: infinite recursion
detected in policy for relation "profiles"`. Esto rompía el login: la
sesión se creaba bien en Supabase Auth, pero el servidor no podía leer el
`profile` del usuario para armar la sesión de la app, y `requireSession()`
rebotaba a `/login` en loop.

**Fix**: `current_profile_role()`, una función `security definer` (mismo
patrón que `current_profile_location()`/`has_permission()`), cuya consulta
interna a `profiles` corre con privilegios elevados y no vuelve a evaluar
RLS — corta el ciclo. Agregado además un test estático
(`tests/services/rls-recursion-guard.test.ts`) que escanea **todas** las
migraciones y falla si alguna policy vigente subconsulta directamente su
propia tabla — para que este tipo de bug no se pueda reintroducir sin que
un test lo note, aunque solo correr contra Postgres real lo hubiera
atrapado la primera vez.

## Fase 8 — Marca, recetas e insumos con costo (ver migración 0031)

Cierra un hueco documentado desde Fase 4 (`stock-engine.ts`): las recetas
nunca se habían implementado, `products.current_cost` era un número plano
cargado a mano, y `stock_items` no guardaba costo unitario en ningún lado.

Agrega `brands` (marca del producto, con `exclusive_channel_id` para reglas
como "esta marca solo vende en este canal"), `stock_item_costs` (costo de
insumo versionado en el tiempo, mismo patrón que `channel_prices`) y
`product_recipe_items` (la receta: qué insumos y en qué cantidad componen
un producto). Un producto sin filas en `product_recipe_items` sigue usando
`current_cost` como fallback manual — no rompe nada de lo que ya funciona.
El cálculo de costo a partir de la receta lo hace `recipe-engine.ts` en
TypeScript puro, nunca SQL, mismo principio que el resto de los motores.
Ver `Fase8_Marca_Recetas_Insumos_Arquitectura.md` para el detalle completo
de las decisiones.

## Fase 9 — Editar/desactivar en todos los módulos (ver migración 0032)

Auditoría real de la app: ningún módulo tenía edición ni borrado más allá de
un puñado de acciones puntuales (pay, collect, cost). Se separó en tres
categorías:

- **Ya existía en la base, solo faltaba UI**: `reverse_movement()` y
  `reverse_stock_movement()` (Fase 1.1/4) y `set_channel_price()` (Fase 2)
  estaban implementadas y testeadas hace tiempo — ahora tienen botón.
- **Inmutable a propósito, no se tocó**: gastos/obligaciones pagados,
  comisiones/settlements cobrados. La corrección sigue siendo reversión +
  registro nuevo, nunca un UPDATE directo — mismo criterio de auditoría de
  siempre.
- **Gap real, cerrado en 0032 + nuevas rutas/UI**: cuentas, proveedores,
  gastos pendientes, categorías de gasto, productos/precios por canal,
  insumos y objetivos ahora se pueden editar y desactivar (o eliminar, en
  el caso de objetivos, que no tiene ninguna tabla que lo referencie).
  Ninguna entidad con FKs en contra tiene borrado real — todas usan la
  columna `active` para soft-delete, mismo patrón que ya usaba `products`.

## Fase 10 — Liquidación manual + revertir pagos ya hechos (ver migración 0033)

Dos pedidos reales de uso, no bugs:

- **"la liquidación la quiero hacer manual"**: `generate_settlement()` (Fase
  2) exige ventas cargadas vía `record_sale()` para agrupar — pero el dueño
  del negocio decidió no cargar venta por venta (no le suma tiempo), así
  que ese flujo nunca tenía de dónde sacar datos. `create_manual_settlement()`
  inserta la liquidación directo con el monto ya calculado afuera de la app.
  Alimenta el mismo `listExpectedInflows()` que ya usa `financial-engine.ts`,
  así que entra al calendario financiero exactamente igual que una
  liquidación automática — el motor no distingue el origen. Se marca con
  `is_manual = true` para que quede claro en la UI de dónde salió el número.

- **"en gastos no me deja eliminar o editar"**: un gasto/obligación YA
  PAGADO es inmutable a propósito (trigger, desde 0005) — Fase 9 solo
  resolvió la edición mientras está *pendiente*. No existía ninguna forma
  de deshacer un pago ya cargado, ni siquiera vía reversión. Se agregan
  `reverse_expense_payment()` y `reverse_obligation_payment()`, mismo
  patrón que `reverse_movement()` (0014): revierten el movimiento de caja
  (nunca lo borran) y devuelven el registro a `pending`, donde el PATCH de
  Fase 9 ya lo puede editar o volver a pagar bien.

## Fase 11 — Editor de recetas con costo calculado (nunca implementado hasta ahora)

Fase 8 dejó las tablas (`product_recipe_items`, `stock_item_costs`) y la
función de lectura (`product_recipe_with_costs`, 0031), pero nunca el motor
que calcula el costo ni la UI para cargar la receta — solo se habían
cargado 3 productos a mano por SQL. Se agrega:

- `lib/services/recipe-engine.ts`: motor puro nuevo, `calculateRecipeCost()`
  — cantidad × costo unitario de cada insumo, redondeo solo al final (no
  por línea, para no arrastrar error en insumos de cantidad chica como sal
  fina). Con tests que reproducen el ejemplo real de Lomo Grande.
- `lib/repositories/recipes.repo.ts`: `saveProductRecipe()` reemplaza la
  receta completa de un producto de una sola vez (no incremental) y
  persiste el costo calculado en `products.current_cost` — así
  `profitability-engine.ts` sigue leyendo exactamente lo mismo que ya leía,
  sin enterarse de que ahora el número viene de una receta.
- UI en `/sales`: cada producto tiene un botón "Receta" que abre una
  plantilla con **todos** los insumos del catálogo y un campo de cantidad
  por insumo — se completan los que aplican, se deja el resto vacío, un
  solo "Guardar receta" manda todo junto.

## Fase 12 — Revertir cobro de liquidación + eliminar manual pendiente (ver migración 0034)

Encontrado al usar la liquidación manual de Fase 10: `collect_settlement()`
(0018) marca `status='collected'` sin vuelta atrás. El botón "Revertir" de
`/movements` (Fase 9) deshace el impacto en caja, pero nunca le avisaba a
la tabla `settlements` — quedaba marcada "cobrada" para siempre aunque la
plata se hubiera revertido, inconsistente entre las dos tablas.

- `reverse_settlement_collection()`: mismo patrón que `reverse_expense_payment`
  (0033) — revierte el movimiento de caja y devuelve la liquidación a
  `pending`. Nueva sección "Cobradas (historial)" en `/settlements` con el
  botón.
- `delete_pending_manual_settlement()`: una liquidación manual cargada con
  el monto equivocado ahora se puede borrar directamente mientras esté
  pendiente — **solo** si `is_manual = true` (una generada desde ventas
  tiene `orders.settlement_id` apuntando a ella, borrarla las dejaría
  huérfanas; para esas la corrección sigue siendo reversión).
- `CollectSettlementButton` ahora pide confirmación y deja elegir cualquier
  cuenta (antes iba directo a la primera de la lista sin preguntar).

## Fase 13 — Elegir cuenta al pagar (todos los módulos) + receta desde Rentabilidad

Dos cosas más encontradas usando la app:

- **"que me deje elegir por qué medio de pago"**: el mismo bug de
  `CollectSettlementButton` (Fase 12: iba directo a la primera cuenta de la
  lista, sin preguntar) estaba también en `PayExpenseButton`,
  `PayObligationButton` y `PayCommissionButton` — los cuatro botones de
  "pagar/cobrar" de toda la app compartían el mismo problema. Los cuatro
  ahora piden confirmación y dejan elegir cualquier cuenta.
- **"en rentabilidad no tengo abierto por insumo"**: `/profitability` tenía
  su propia sección "Costo actual por producto" con el campo de costo plano
  de siempre, separada de la de `/sales` — nunca se conectó al editor de
  recetas de Fase 11. `ProductCostRow` agrega el mismo botón "Receta"
  (reutiliza `RecipeEditor` de `/sales`, no hay lógica duplicada) también acá.

## Fase 14 — Import histórico agregado de ventas (ver migración 0035)

`import_order()` (0029, Fase 7) acepta fecha histórica pero solo crea el
pedido a nivel total, sin `order_items` — documentado ahí mismo. El motor de
rentabilidad (`sales_summary_by_product_channel`, 0025) agrupa por
`order_items.product_id`: un pedido sin líneas no aporta nada a ningún
cálculo de margen por producto. `import_historical_product_sale()` es la
función que faltaba: un pedido + una línea por producto/canal/período, a
partir de datos ya agregados (unidades totales + ticket promedio de un
reporte de PedidosYa) — no pretende ser el detalle venta por venta, que el
dueño del negocio decidió explícitamente no cargar.

**Limitación real, documentada a propósito**: todas las unidades de un
producto quedan estampadas en una sola fecha (fin del período importado).
Correcto para sumar ingresos/margen de todo el período — que es lo único
que necesita el motor de rentabilidad — pero **no debe usarse** para nada
que dependa de la distribución diaria real (proyección de objetivos,
consumo estimado de stock). Esos motores seguirán viendo estos pedidos
importados como si fueran ventas de un solo día, lo cual los distorsionaría
si se les diera de comer estos datos para ese fin.

## Qué falta después de Fase 1

Ver el roadmap en los documentos de arquitectura entregados. Fase 2 es el
motor financiero completo (liquidez por horizonte, simulador de adelanto de
PedidosYa, liquidaciones reales). No avanzar a Fase 2 sin autorización.
