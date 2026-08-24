/**
 * Decides which browser origins may call the API. A single fixed origin (the old
 * CORS_ORIGIN behaviour) breaks the moment the frontend is reached from a
 * different address — a LAN IP, a VPN IP, a phone on the shop WiFi — since each
 * of those is a different origin as far as CORS is concerned. Hardcoding every
 * possible address is a losing game, so instead: allow the exact origins listed
 * in CORS_ORIGIN, plus *any* origin whose host is private address space (LAN) or
 * Tailscale's CGNAT range (100.64.0.0/10), as long as the port matches the
 * frontend's own port. This never opens the door to the public internet — a
 * random origin out on the web still gets rejected — it only recognises "this is
 * clearly the same private network or VPN mesh the server itself is running on".
 */

const PRIVATE_IPV4_RANGES: [number, number][] = [
  [ipToInt("10.0.0.0"), ipToInt("10.255.255.255")],
  [ipToInt("172.16.0.0"), ipToInt("172.31.255.255")],
  [ipToInt("192.168.0.0"), ipToInt("192.168.255.255")],
  // Tailscale (and other CGNAT-based VPN meshes) assign addresses from this block.
  [ipToInt("100.64.0.0"), ipToInt("100.127.255.255")],
];

function ipToInt(ip: string): number {
  const parts = ip.split(".").map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isPrivateIPv4(host: string): boolean {
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return false;
  const value = ipToInt(host);
  return PRIVATE_IPV4_RANGES.some(([lo, hi]) => value >= lo && value <= hi);
}

export function buildCorsOriginChecker(frontendPort: string) {
  const explicit = new Set((process.env.CORS_ORIGIN ?? "").split(",").filter(Boolean));

  return (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void,
  ) => {
    // No Origin header at all (curl, server-to-server, same-origin) — allow.
    if (!origin) return callback(null, true);
    if (explicit.has(origin)) return callback(null, true);

    try {
      const url = new URL(origin);
      const portMatches = url.port === frontendPort;
      const hostIsTrusted =
        url.hostname === "localhost" || url.hostname === "127.0.0.1" || isPrivateIPv4(url.hostname);
      if (portMatches && hostIsTrusted) return callback(null, true);
    } catch {
      // Malformed Origin header — fall through to reject.
    }
    callback(new Error(`Origin ${origin} is not allowed`));
  };
}
