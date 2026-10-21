export { cn } from "cn"

// text color that stays readable on a route color ("#RRGGBB")
export function inkFor(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255]
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#16181d' : '#ffffff'
}
