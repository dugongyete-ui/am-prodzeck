'use client';

import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { AutoAuthFlow } from './components/AutoAuthFlow';
import { CleanHistory } from './components/CleanHistory';
import {
  DEFAULT_CONFIG,
  getSavedApiKey,
  getSavedSession,
  saveApiKeyToLocal,
  saveSessionToLocal,
  sendLinkApi,
  verifyLinkApi,
} from './services/api';
import { ActivityLogItem, RelayResult, SessionData } from './types';
import { CheckCircle2, AlertCircle, KeyRound } from 'lucide-react';

export default function App() {
  const [activeView, setActiveView] = useState<'auth' | 'history'>('auth');
  const [session, setSession] = useState<SessionData | null>(null);
  const [history, setHistory] = useState<ActivityLogItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [apiKey, setApiKey] = useState<string>('');
  const [apiKeyRemaining, setApiKeyRemaining] = useState<number | null>(null);
  const [apiKeyMax, setApiKeyMax] = useState<number>(3);
  const [contactHint, setContactHint] = useState<string | null>(null);
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 3800);
  };

  // Load session & history on mount
  useEffect(() => {
    const localSession = getSavedSession();
    if (localSession) {
      setSession(localSession);
      if (typeof localSession.apiKeyRemaining === 'number') {
        setApiKeyRemaining(localSession.apiKeyRemaining);
      }
      if (typeof localSession.apiKeyMax === 'number') {
        setApiKeyMax(localSession.apiKeyMax);
      }
    }

    const savedKey = getSavedApiKey();
    if (savedKey) {
      setApiKey(savedKey);
    }

    // SECURITY: we no longer call GET /api/relay/session — that route is
    // removed and blocked by middleware. Per-browser server-side state
    // (sessionKey, nonce, challenge, pow) lives in a signed HttpOnly
    // cookie that the server reads on verify-link. The client never sees
    // those values.

    try {
      const storedHistory = localStorage.getItem('auralink_clean_history_v1');
      if (storedHistory) {
        setHistory(JSON.parse(storedHistory));
      }
    } catch {}
  }, []);

  // Keep apikey synced to localStorage whenever it changes.
  useEffect(() => {
    saveApiKeyToLocal(apiKey || null);
  }, [apiKey]);

  const saveHistoryItem = (item: ActivityLogItem) => {
    setHistory((prev) => {
      const updated = [item, ...prev].slice(0, 30);
      try {
        localStorage.setItem('auralink_clean_history_v1', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  // Handler for sending email (Step 1)
  const handleSendEmail = async (email: string): Promise<boolean> => {
    setIsLoading(true);
    setContactHint(null);
    setWhatsappUrl(null);

    try {
      const res: RelayResult = await sendLinkApi(email, DEFAULT_CONFIG, apiKey || null);

      if (res.session) {
        setSession(res.session);
        saveSessionToLocal(res.session);
        if (typeof res.session.apiKeyRemaining === 'number') {
          setApiKeyRemaining(res.session.apiKeyRemaining);
        }
      }
      if (typeof res.apiKeyRemaining === 'number') {
        setApiKeyRemaining(res.apiKeyRemaining);
      }
      if (typeof res.apiKeyMax === 'number') {
        setApiKeyMax(res.apiKeyMax);
      }
      if (res.contactHint) setContactHint(res.contactHint);
      if (res.whatsappUrl) setWhatsappUrl(res.whatsappUrl);

      if (res.ok) {
        showToast(
          res.data?.message || 'Tautan aktivasi terkirim. Cek kotak masuk dan folder spam.'
        );
        return true;
      } else {
        showToast(res.data?.message || res.error || 'Gagal mengirim tautan. Coba lagi sebentar.', 'error');
        return false;
      }
    } catch (err: any) {
      showToast(err.message || 'Terjadi gangguan saat menghubungi server.', 'error');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // Handler for verifying link or code (Step 2)
  const handleVerifyLink = async (input: string): Promise<boolean> => {
    setIsLoading(true);

    try {
      const res: RelayResult = await verifyLinkApi(input, DEFAULT_CONFIG, session);

      if (res.session) {
        setSession(res.session);
        saveSessionToLocal(res.session);
      }

      saveHistoryItem({
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toISOString(),
        type: 'verify-link',
        input,
        payload: { magicLink: input, email: session?.email },
        response: res.data,
        ok: res.ok,
        status: res.status,
        durationMs: res.durationMs,
        attempts: res.attempts,
      });

      if (res.ok) {
        showToast('Premium aktif. Alight Motion Premium 1 tahun siap dipakai.');
        return true;
      } else {
        showToast(
          res.data?.message || res.error || 'Verifikasi gagal. Tautan mungkin sudah kedaluwarsa.',
          'error'
        );
        return false;
      }
    } catch (err: any) {
      showToast(err.message || 'Terjadi kesalahan saat memverifikasi tautan.', 'error');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // Reset session completely
  const handleResetSession = async () => {
    saveSessionToLocal(null);
    setSession(null);
    setApiKeyRemaining(null);
    setContactHint(null);
    setWhatsappUrl(null);
    // SECURITY: we no longer DELETE /api/relay/session. The server-side
    // signed cookie will expire on its own (15-min TTL); we just clear
    // the client-side localStorage session.
    showToast('Sesi direset. Siap untuk aktivasi baru.');
  };

  const handleClearHistory = () => {
    setHistory([]);
    localStorage.removeItem('auralink_clean_history_v1');
    showToast('Riwayat dibersihkan.');
  };

  return (
    <div className="min-h-screen bg-[#F8F9F6] text-[#243329] flex flex-col font-sans selection:bg-[#D5E3D8] selection:text-[#18261E]">
      <Header
        activeView={activeView}
        onSelectView={setActiveView}
        onResetAll={handleResetSession}
        historyCount={history.filter((h) => h.ok).length}
      />

      {/* Subtle Toast Feedback */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-white border border-[#E1E7DE] shadow-[0_8px_30px_rgb(0,0,0,0.08)] text-xs text-[#202E24] animate-in fade-in slide-in-from-bottom-2">
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-[#3E744F] shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-[#A94343] shrink-0" />
          )}
          <span className="font-medium leading-relaxed">{toastMessage.text}</span>
        </div>
      )}

      {/* Main Viewport Presence */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12 flex flex-col justify-center">
        {activeView === 'auth' ? (
          <AutoAuthFlow
            currentSession={session}
            isLoading={isLoading}
            apiKey={apiKey}
            setApiKey={setApiKey}
            apiKeyRemaining={apiKeyRemaining}
            apiKeyMax={apiKeyMax}
            contactHint={contactHint}
            whatsappUrl={whatsappUrl}
            onSendEmail={handleSendEmail}
            onVerifyLinkOrCode={handleVerifyLink}
            onResetSession={handleResetSession}
          />
        ) : (
          <CleanHistory
            history={history}
            onClearHistory={handleClearHistory}
          />
        )}
      </main>

      {/* Ultra-Quiet Footer */}
      <footer className="border-t border-[#E8ECE4] py-5 sm:py-6 text-[11px] sm:text-xs text-[#7A8A7D]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-center sm:justify-center gap-1.5 sm:gap-2 text-center sm:text-left">
          <span className="font-semibold text-[#28382C]">Dzeck Premium</span>
          <span aria-hidden="true" className="hidden sm:inline">·</span>
          <span>Aktivasi Alight Motion Premium 1 Tahun</span>
        </div>
      </footer>
    </div>
  );
}
