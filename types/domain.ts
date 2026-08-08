// Tipos del dominio, independientes de Supabase (que tiene sus propios tipos
// generados en lib/supabase/database.types.ts). Los servicios de lib/services
// trabajan exclusivamente con estos tipos simples.

export type AccountType = "efectivo" | "banco" | "mercado_pago" | "otra_billetera";

export interface CashAccount {
  id: string;
  name: string;
  type: AccountType;
}

export type MovementDirection = "ingreso" | "egreso";

export interface CashMovement {
  id: string;
  accountId: string;
  amount: number;
  direction: MovementDirection;
  date: string; // ISO date
  originType: string;
}

export interface Obligation {
  id: string;
  supplierId: string;
  amount: number;
  estimatedDueDate: string; // ISO date
  status: "pending" | "paid";
}

export interface CommissionCharge {
  id: string;
  amount: number;
  estimatedPaymentDate: string; // ISO date
  status: "pending" | "paid";
}

/** Un cobro esperado (liquidación agrupada, o cualquier ingreso futuro conocido). */
export interface ExpectedInflow {
  id: string;
  amount: number;
  expectedDate: string; // ISO date
}

export interface HorizonProjection {
  horizonDays: number;
  horizonDate: string; // ISO date
  expectedInflows: number;
  committed: number;
  liquidityBeforeReserve: number;
  reserve: number;
  availableReal: number;
}

export interface PedidosYaAdvanceSimulation {
  netReceivableIfWait: number;
  waitDate: string;
  netReceivableIfAdvance: number;
  advanceDate: string;
  advanceCost: number;
  costPercentApplied: number; // fee% * (1+vat%) efectivo
}

export type AdvanceDecision = "advance" | "wait";

export interface AdvanceRecommendation {
  decision: AdvanceDecision;
  reason: string;
}

/* ---- Fase 3: rentabilidad ---- */

export interface ProductChannelSalesSummary {
  productId: string;
  channelId: string;
  unitsSold: number;
  grossRevenue: number; // suma de order_items.quantity * unit_price realmente vendido
}

export interface MarginSnapshot {
  productId: string;
  channelId: string;
  unitsSold: number;
  unitPrice: number; // precio promedio realmente cobrado (grossRevenue / unitsSold)
  unitCost: number;
  unitProfit: number;
  marginPercent: number; // 0..1
  totalProfit: number;
  totalContribution: number; // = totalProfit en esta fase (sin costos fijos asignados por producto)
}

export interface MarginDropAlert {
  productId: string;
  channelId: string;
  previousMarginPercent: number;
  currentMarginPercent: number;
  dropPoints: number; // puntos porcentuales (0..1) que cayó
}

/* ---- Fase 4: stock ---- */

export type StockMovementDirection = "entrada" | "salida";

export interface StockMovement {
  id: string;
  stockItemId: string;
  quantity: number;
  direction: StockMovementDirection;
  date: string; // ISO date
  originType: string;
}

export interface StockItem {
  id: string;
  name: string;
  unit: string;
  minStock: number;
  safetyStock: number;
}

export interface DailyConsumptionEstimate {
  value: number; // unidades/día, 0 si insuficiente
  confidence: ConfidenceLevel;
  daysWithData: number;
}

export interface CoverageResult {
  days: number | null; // null = no se puede calcular (confianza insuficiente o consumo 0)
  confidence: ConfidenceLevel;
}

export type PurchasePriority = "alta" | "media" | "baja" | "revisar";

export interface RecommendedPurchase {
  stockItemId: string;
  currentStock: number;
  projectedConsumption: number;
  safetyStock: number;
  neededQuantity: number;
  priority: PurchasePriority;
  confidence: ConfidenceLevel;
}

/* ---- Fase 5: objetivos ---- */

export type GoalType = "weekly" | "monthly" | "annual";
export type GoalVariable =
  | "facturacion"
  | "ganancia"
  | "pedidos"
  | "ticket_promedio"
  | "margen"
  | "caja"
  | "ahorro";

export interface Goal {
  id: string;
  type: GoalType;
  variable: GoalVariable;
  targetValue: number;
  periodStart: string; // ISO date
  periodEnd: string; // ISO date
}

export interface DailySeriesPoint {
  date: string; // ISO date
  value: number;
}

export interface GoalProgress {
  targetValue: number;
  achievedValue: number;
  remaining: number;
  percentComplete: number; // 0..1+ (puede superar 1 si ya se cumplió)
  daysElapsed: number;
  daysRemaining: number;
  simpleRequiredDailyAverage: number; // reparto lineal, siempre calculable como piso de referencia
}

export interface GoalProjection {
  progress: GoalProgress;
  confidence: ConfidenceLevel; // 'estimado' si hay historial suficiente para ponderar por día, 'insuficiente' si no
  projectedRemainingTotal: number | null; // null si insuficiente
  feasible: boolean | null; // null si no se puede afirmar con el historial disponible
  shortfall: number | null; // remaining - proyectado, solo si feasible === false
}

/* ---- Fase 5: simulador "qué pasa si" ---- */

export interface SimulationBaseline {
  unitsSold: number;
  unitPrice: number;
  unitCost: number;
  commissionPercent: number; // 0..1
  fixedCosts: number; // gastos fijos del período simulado
}

export interface SimulationAdjustments {
  priceDeltaPercent: number; // ej. 0.05 = +5%
  volumeDeltaPercent: number; // ej. -0.10 = -10%
  costDeltaPercent: number; // ej. 0.05 = +5%
  commissionOverridePercent?: number; // si se especifica, reemplaza directamente el % de comisión
}

export interface SimulationScenario {
  unitsSold: number;
  unitPrice: number;
  unitCost: number;
  commissionPercent: number;
  revenue: number;
  netRevenue: number;
  totalCost: number;
  profit: number;
  marginPercent: number;
  breakEvenUnits: number | null; // null si la contribución unitaria es <= 0 (nunca se alcanza equilibrio)
}

export interface SimulationResult {
  current: SimulationScenario;
  simulated: SimulationScenario;
  delta: { revenue: number; profit: number; marginPercent: number };
}

/* ---- Fase 7: importación ---- */

export interface ImportColumnMapping {
  date: string; // nombre de la columna en el archivo
  time?: string;
  externalOrderNumber?: string;
  total: string;
  discount?: string;
  paymentMethod?: string;
}

export type ImportRowStatus = "ok" | "warning" | "error" | "duplicate";

export interface ImportRowResult {
  rowIndex: number; // 1-based, fila del archivo (sin contar encabezado)
  status: ImportRowStatus;
  message?: string;
}

export interface ImportSummary {
  totalRows: number;
  okRows: number;
  warningRows: number;
  errorRows: number;
  duplicateRows: number;
  percentIdentified: number; // (ok + warning) / total, 0..1
}

export interface RecurringExpenseProjection {
  amount: number;
  dueDate: string; // próxima fecha de vencimiento proyectada
}

/** Nivel de confianza del dato, según la Sección 21/49 del prompt maestro. */
export type ConfidenceLevel = "real" | "manual" | "estimado" | "insuficiente";

export interface FinancialSnapshot {
  facturacion: number;
  cobrado: number;
  porCobrar: number;
  comisionesPendientes: number;
  comprometido: number;
  cajaDisponible: number;
  reserva: number;
  disponibleReal: number;
}
