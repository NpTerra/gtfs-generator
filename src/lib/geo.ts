// Flat XY grid (meters) <-> GPS conversion. Same constants and formulas as
// the Java generator, so stops.txt output is identical.

export const M_PER_DEG_LAT = 110574.0
export const M_PER_DEG_LON = 111320.0

export function xyToGPS(x: number, y: number): { lat: number; lon: number } {
  const lat = y / M_PER_DEG_LAT
  const cosLat = Math.cos(lat * Math.PI / 180)
  if (Math.abs(cosLat) < 1e-12)
    throw new Error('Latitude too close to a pole, longitude is undefined there.')

  let lon = (x / M_PER_DEG_LON) / cosLat
  // normalize to [-180, 180)
  lon = (lon + 180.0) % 360.0
  if (lon < 0) lon += 360.0
  lon -= 180.0
  return { lat, lon }
}

export function gpsToXY(lat: number, lon: number): { x: number; y: number } {
  const cosLat = Math.cos(lat * Math.PI / 180)
  if (Math.abs(cosLat) < 1e-12)
    throw new Error('Latitude too close to a pole, X is undefined there.')
  return { x: lon * cosLat * M_PER_DEG_LON, y: lat * M_PER_DEG_LAT }
}
