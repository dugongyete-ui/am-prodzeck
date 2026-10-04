import { DetectionResult, EngineConfig, RelayResult, SessionData } from '../types';

export const DEFAULT_CONFIG: EngineConfig = {
  baseUrl: 'https://am-web-three.vercel.app',
  timeoutMs: 30000,
  maxRetries: 3,
  userAgentType: 'devbrowser',
};

const SESSION_STORAGE_KEY = 'auralink_session_v1';
const HISTORY_STORAGE_KEY = 'auralink_history_v1';
const CONFIG_STORAGE_KEY = 'auralink_config_v1';
const APIKEY_STORAGE_KEY = 'dzeck_premium_apikey_v1';

// Argument detection matching user's scraper.js
export function isEmail(str: string): boolean {
  if (!str) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str.trim());
}

export function isUrl(str: string): boolean {
  if (!str) return false;
  return /^https?:\/\//i.test(str.trim());
}

export function isOobCode(str: string): boolean {
  if (!str) return false;
  const trimmed = str.trim();
  if (isEmail(trimmed) || isUrl(trimmed)) return false;
  return trimmed.length >= 20 && /^[A-Za-z0-9._\-]+$/.test(trimmed);
}

export function extractCodeFromUrl(urlStr: string): string {
  try {
    const u = new URL(urlStr.trim());
    return (
      u.searchParams.get('oobCode') ||
      u.searchParams.get('oobcode') ||
      u.searchParams.get('code') ||
      urlStr.trim()
    );
  } catch {
    return urlStr.trim();
  }
}

export function detectInput(raw: string): DetectionResult {
  const val = raw.trim();
  if (!val) {
    return {
      category: 'empty',
      label: 'Menunggu input',
      suggestedAction: 'none',
      hint: 'Ketik alamat email, salin tautan verifikasi, atau masukkan kode oobCode.',
    };
  }

  if (isEmail(val)) {
    return {
      category: 'email',
      label: 'Alamat Email',
      suggestedAction: 'send-link',
      hint: 'Siap menjalankan pertukaran kunci sesi, PoW, dan mengirim tautan login (Tahap 1).',
    };
  }

  if (isUrl(val)) {
    const extracted = extractCodeFromUrl(val);
    const hasParam = extracted !== val;
    return {
      category: 'url',
      label: 'Tautan URL Verifikasi',
      extractedCode: extracted,
      suggestedAction: 'verify-link',
      hint: hasParam
        ? `Parameter oobCode berhasil diekstrak (${extracted.substring(0, 16)}...). Siap diverifikasi.`
        : 'Tautan URL lengkap siap diverifikasi ke server target bersama kunci sesi aktif.',
    };
  }

  if (isOobCode(val)) {
    return {
      category: 'oobCode',
      label: 'Kode oobCode Firebase/Auth',
      extractedCode: val,
      suggestedAction: 'verify-link',
      hint: 'Format kode verifikasi dikenali. Siap divalidasi ke server target (Tahap 2).',
    };
  }

  return {
    category: 'unknown',
    label: 'Format Tautan / Kode',
    extractedCode: val,
    suggestedAction: 'verify-link',
    hint: 'Akan diperlakukan sebagai tautan atau kode verifikasi.',
  };
}

// Session persistence
export function getSavedSession(): SessionData | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveSessionToLocal(session: SessionData | null) {
  try {
    if (!session) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } else {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    }
  } catch (err) {
    console.error('Failed to save session to local storage', err);
  }
}

export function getSavedConfig(): EngineConfig {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfigToLocal(config: EngineConfig) {
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch (err) {
    console.error('Failed to save config', err);
  }
}

// Apikey persistence (user's own key, stored locally so they don't re-enter it).
export function getSavedApiKey(): string | null {
  try {
    return localStorage.getItem(APIKEY_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function saveApiKeyToLocal(key: string | null) {
  try {
    if (!key) {
      localStorage.removeItem(APIKEY_STORAGE_KEY);
    } else {
      localStorage.setItem(APIKEY_STORAGE_KEY, key);
    }
  } catch (err) {
    console.error('Failed to save apikey', err);
  }
}

// Client API Calls (calls server relay)
export async function sendLinkApi(
  email: string,
  config: EngineConfig = DEFAULT_CONFIG,
  apiKey?: string | null
): Promise<RelayResult> {
  try {
    const res = await fetch('/api/relay/send-link', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email.trim(),
        apiKey: apiKey ? apiKey.trim() : undefined,
        baseUrl: config.baseUrl,
        timeout: config.timeoutMs,
      }),
    });

    const data = await res.json();
    if (data.session) {
      saveSessionToLocal(data.session);
    }
    return data;
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      headers: {},
      data: null,
      error: err.message || 'Gagal terhubung ke relay internal.',
      attempts: 1,
      durationMs: 0,
    };
  }
}

export async function verifyLinkApi(
  input: string,
  config: EngineConfig = DEFAULT_CONFIG,
  session?: SessionData | null
): Promise<RelayResult> {
  try {
    const res = await fetch('/api/relay/verify-link', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: input.trim(),
        email: session?.email,
        sessionKey: session?.sessionKey,
        nonce: session?.nonce,
        baseUrl: config.baseUrl,
        timeout: config.timeoutMs,
      }),
    });

    const data = await res.json();
    if (data.session) {
      saveSessionToLocal(data.session);
    }
    return data;
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      headers: {},
      data: null,
      error: err.message || 'Gagal terhubung ke relay internal.',
      attempts: 1,
      durationMs: 0,
    };
  }
}

// Download helper for results & sessions
export function downloadJsonFile(filename: string, content: any) {
  const jsonStr = JSON.stringify(content, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Generate cURL command representation
export function generateCurlCommand(
  type: 'send-link' | 'verify-link',
  body: any,
  baseUrl: string
): string {
  const endpoint = type === 'send-link' ? '/api/send-link' : '/api/verify-link';
  const url = `${baseUrl.replace(/\/+$/, '')}${endpoint}`;
  const jsonBody = JSON.stringify(body);

  return `curl -X POST '${url}' \\
  -H 'Content-Type: application/json' \\
  -H 'Accept: */*' \\
  -H 'Origin: ${baseUrl}' \\
  -H 'Referer: ${baseUrl}/' \\
  -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' \\
  -H 'X-Requested-With: com.unixshells.devbrowser' \\
  -d '${jsonBody}'`;
}
