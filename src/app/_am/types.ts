export interface SessionAccountData {
  email?: string;
  uid?: string;
  orderId?: string;
  idToken?: string;
}

export interface SessionData {
  email?: string | null;
  oobCode?: string | null;
  sessionKey?: string | null;
  nonce?: string | null;
  challenge?: string | null;
  pow?: number | null;
  accountData?: SessionAccountData | null;
  lastSendPayload?: any;
  lastSendResponse?: any;
  lastVerifyInput?: any;
  lastVerifyResponse?: any;
  savedAt?: string;
  verifiedAt?: string;
  apiKeyId?: string;
  apiKeyRemaining?: number;
  apiKeyMax?: number;
}

export type InputCategory = 'email' | 'url' | 'oobCode' | 'unknown' | 'empty';

export interface DetectionResult {
  category: InputCategory;
  label: string;
  extractedCode?: string;
  suggestedAction: 'send-link' | 'verify-link' | 'none';
  hint: string;
}

export interface RelayResult {
  ok: boolean;
  status: number;
  headers: Record<string, string>;
  data: any;
  error?: string;
  code?: string;
  attempts: number;
  durationMs: number;
  oobCode?: string | null;
  nonce?: string | null;
  accountData?: SessionAccountData | null;
  session?: SessionData;
  apiKeyRemaining?: number;
  apiKeyMax?: number;
  keyExpired?: boolean;
  keyEmailCount?: number;
  keyMaxEmails?: number;
  contactHint?: string;
  whatsappUrl?: string;
}

export interface ActivityLogItem {
  id: string;
  timestamp: string;
  type: 'send-link' | 'verify-link';
  input: string;
  payload: any;
  response: any;
  ok: boolean;
  status: number;
  durationMs: number;
  attempts: number;
  oobCodeFound?: string | null;
}

export interface EngineConfig {
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
  userAgentType: 'devbrowser' | 'chrome' | 'custom';
  customHeadersJson?: string;
}
