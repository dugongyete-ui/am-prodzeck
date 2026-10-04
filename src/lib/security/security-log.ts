import 'server-only';

// Structured security logging. Output is a single-line JSON per event so it
// can be ingested by any log aggregator (Loki, Datadog, CloudWatch…).
//
// CRITICAL: never log plaintext secrets. Only log fingerprints/prefixes.

type SecurityEvent =
  | 'admin_login_attempt'
  | 'admin_login_success'
  | 'admin_login_failure'
  | 'admin_logout'
  | 'apikey_invalid'
  | 'apikey_expired'
  | 'apikey_exhausted'
  | 'apikey_quota_used'
  | 'apikey_quota_update_error'
  | 'apikey_created'
  | 'apikey_deleted'
  | 'apikey_delete_error'
  | 'apikey_reset'
  | 'apikey_reset_error'
  | 'rate_limit_hit'
  | 'csrf_invalid'
  | 'origin_rejected'
  | 'origin_mismatch_but_allowed'
  | 'referer_mismatch_but_allowed'
  | 'signature_invalid'
  | 'nonce_replay'
  | 'timestamp_skew'
  | 'session_invalid'
  | 'session_cookie_invalid'
  | 'unauthorized_request'
  | 'relay_upstream_error'
  | 'pagination_abuse';

interface LogPayload {
  ipHash?: string;
  ip?: string;
  keyPrefix?: string;
  sessionId?: string;
  endpoint?: string;
  method?: string;
  status?: number;
  reason?: string;
  [k: string]: unknown;
}

const isProd = process.env.NODE_ENV === 'production';

export function securityLog(
  event: SecurityEvent,
  level: 'info' | 'warn' | 'error' = 'info',
  payload: LogPayload = {}
) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...payload,
  });
  // In prod use stderr so it doesn't get confused with response bodies.
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
  if (!isProd) {
    // Dev: also visible in dev.log via tee.
  }
}

// Fingerprint an apikey for logging — only the non-secret prefix.
export function keyFingerprint(key: string): string {
  if (!key) return '<empty>';
  // Format: dzk_<8hex>_<24hex>. Show the prefix + first 2 chars of the
  // secret only.
  if (key.length < 16) return '<short>';
  return key.slice(0, 13) + '…' + key.slice(-2);
}

// Fingerprint a session token for logging — first 8 + last 4.
export function tokenFingerprint(token: string): string {
  if (!token || token.length < 16) return '<short>';
  return token.slice(0, 8) + '…' + token.slice(-4);
}
