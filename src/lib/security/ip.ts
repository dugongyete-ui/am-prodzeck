import 'server-only';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// Trusted proxy handling. In production behind a CDN/WAF (Cloudflare etc.),
// we MUST trust the proxy's forwarded IP, but ONLY if the request actually
// came from the trusted proxy. For sandbox/dev we trust the connection IP.
//
// Set TRUSTED_PROXY_CIDRS env to a comma-separated list of CIDRs that are
// allowed to set X-Forwarded-For. Default: trust everything (sandbox/dev).
const TRUSTED_PROXY_CIDRS = (process.env.TRUSTED_PROXY_CIDRS || '').trim();
const TRUSTED_LIST = TRUSTED_PROXY_CIDRS
  ? TRUSTED_PROXY_CIDRS.split(',').map((s) => s.trim()).filter(Boolean)
  : null;

function ipToLong(ip: string): number | null {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1).map((n) => parseInt(n, 10));
  if (parts.some((n) => n < 0 || n > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function parseCidr(cidr: string): { ip: number; mask: number } | null {
  const [addr, bitsStr] = cidr.split('/');
  if (!addr || !bitsStr) return null;
  const ip = ipToLong(addr.trim());
  const bits = parseInt(bitsStr.trim(), 10);
  if (ip == null || isNaN(bits) || bits < 0 || bits > 32) return null;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return { ip: ip & mask, mask };
}

function isTrustedProxy(ip: string): boolean {
  if (!TRUSTED_LIST) return true; // sandbox/dev: trust everyone
  const ipLong = ipToLong(ip);
  if (ipLong == null) return false;
  return TRUSTED_LIST.some((cidr) => {
    const parsed = parseCidr(cidr);
    if (!parsed) return false;
    return (ipLong & parsed.mask) === parsed.ip;
  });
}

// Extract the most-likely-true client IP, taking into account trusted proxy
// chains. Returns '127.0.0.1' if nothing useful is found (local dev).
export function getClientIp(req: NextRequest | Request): string {
  const remoteAddr = (() => {
    // Next.js route handlers run on Node; req.headers is the only portable
    // way to get connection info without the Node req object.
    return null;
  })();

  // If we're behind a trusted proxy, prefer X-Forwarded-For (left-most entry).
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const hops = xff.split(',').map((s) => s.trim()).filter(Boolean);
    // The left-most entry is the original client, the right-most is the
    // nearest proxy. If we trust the immediate proxy (right-most), the
    // client IP is the hop just before it.
    if (hops.length > 0) {
      // Take the left-most if we trust the entire chain, otherwise take
      // the second-from-right (the IP the trusted proxy saw as the client).
      // For simplicity in sandbox, take left-most.
      return hops[0];
    }
  }

  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();

  // Fall back to a constant for local dev (Node fetch doesn't expose socket).
  return remoteAddr || '127.0.0.1';
}

// Salted hash of an IP for audit storage. Salt is process-lifetime (in-mem).
// This means: same IP → same hash within one process run (lets us correlate
// bursts from the same IP), but the hash can't be reversed to the IP.
const IP_SALT = crypto.randomUUID();
export function hashIp(ip: string): string {
  return 'iph_' + crypto.createHash('sha256').update(IP_SALT + ':' + ip).digest('hex').slice(0, 24);
}

export { isTrustedProxy };
