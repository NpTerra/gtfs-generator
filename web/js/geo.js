// Coordinate conversion between a flat XY grid (meters) and GPS coordinates.
// Mirrors the constants and formulas of the Java generator (model/inner/Station.java)
// so that both tools produce identical stops.txt output.
(function () {
    const G = globalThis.GTG ?? (globalThis.GTG = {});

    const M_PER_DEG_LAT = 110574.0;
    const M_PER_DEG_LON = 111320.0;

    function xyToGPS(x, y) {
        const lat = y / M_PER_DEG_LAT;

        const latRad = lat * Math.PI / 180;
        const cosLat = Math.cos(latRad);
        if (Math.abs(cosLat) < 1e-12)
            throw new Error("Latitude too close to a pole, longitude is undefined there.");

        let lon = (x / M_PER_DEG_LON) / cosLat;

        // normalize to [-180, 180)
        lon = ((lon + 180.0) % 360.0);
        if (lon < 0) lon += 360.0;
        lon -= 180.0;

        return { lat, lon };
    }

    function gpsToXY(lat, lon) {
        const latRad = lat * Math.PI / 180;
        const cosLat = Math.cos(latRad);
        if (Math.abs(cosLat) < 1e-12)
            throw new Error("Latitude too close to a pole, X is undefined there.");

        return {
            x: lon * cosLat * M_PER_DEG_LON,
            y: lat * M_PER_DEG_LAT
        };
    }

    G.geo = { M_PER_DEG_LAT, M_PER_DEG_LON, xyToGPS, gpsToXY };
})();
