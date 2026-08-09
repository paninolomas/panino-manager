/**
 * Convierte el valor de un <input type="number"> (o cualquier texto
 * tipeado por el usuario) a number, tolerando coma como separador decimal.
 *
 * Bug real que motivó esto: Number("2,79") devuelve NaN en JS -- solo
 * entiende "." como separador decimal. En Windows/Chrome con configuración
 * regional Argentina, el input numérico puede mostrar y aceptar "2,79" tal
 * cual, así que cualquier campo tipeado en la app (costo, precio, %) podía
 * silenciosamente mandar NaN al backend y fallar la validación de Zod con
 * un mensaje genérico ("No se pudo actualizar...") sin pista real del
 * motivo.
 *
 * Todo `Number(estadoDeUnInput)` que venga de algo que el usuario tipeó
 * debería pasar por acá en su lugar.
 */
export function toNumber(value: string): number {
  if (typeof value !== "string") return Number(value);
  return Number(value.trim().replace(",", "."));
}
