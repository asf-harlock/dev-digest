/** Id of a field's inline error element. */
export const errorId = (fieldId: string): string => `${fieldId}-error`;

/** The id and ARIA wiring every control of a `Field` carries. */
export function controlProps(fieldId: string, error: string | null | undefined, required = false) {
  return {
    id: fieldId,
    "aria-required": required ? (true as const) : undefined,
    "aria-invalid": error ? (true as const) : undefined,
    "aria-describedby": error ? errorId(fieldId) : undefined,
  };
}
