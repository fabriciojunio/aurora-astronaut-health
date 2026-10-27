export function signed(value: number, digits = 1): string {
  const text = value.toFixed(digits)
  return value > 0 ? `+${text}` : text
}
