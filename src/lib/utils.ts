export { cn } from "cn"

// a project's two colors, picked from its name, like IntelliJ's: its icon's
// gradient and the glow in the window's corner
export function projectColors(name: string): [string, string] {
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0)
  return [`hsl(${hue} 65% 55%)`, `hsl(${(hue + 50) % 360} 65% 50%)`]
}

// text color that stays readable on a route color ("#RRGGBB")
export function inkFor(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255]
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#16181d' : '#ffffff'
}
