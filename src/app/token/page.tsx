'use client';

import { useEffect, useState } from 'react';
import {
  Crown,
  KeyRound,
  Loader2,
  Lock,
  RefreshCw,
  Trash2,
  Plus,
  Copy,
  Check,
  LogOut,
} from 'lucide-react';

interface KeyRecord {
  id: string;
  key: string;
  emailCount: number;
  maxEmails: number;
  expired: boolean;
  expiredAt: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  lastEmail: string | null;
  notes: string | null;
}

// WA contact hint constants are intentionally NOT surfaced on the /token
// admin page itself — the admin is the one already inside. These hints are
// reserved for the public main app where users hit an expired/invalid apikey.

export default function TokenAdminPage() {
  const [authed, setAuthed] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [keys, setKeys] = useState<KeyRecord[]>([]);
  const [keysLoading, setKeysLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newKeyNotes, setNewKeyNotes] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  // Check existing session cookie on mount (via /api/token/keys — returns 401 if not authed).
  useEffect(() => {
    fetch('/api/token/keys', { credentials: 'include' })
      .then((r) => {
        if (r.ok) {
          setAuthed(true);
          return r.json().then((data) => {
            setKeys(data.keys || []);
          });
        }
      })
      .catch(() => {})
      .finally(() => setCheckingAuth(false));
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    try {
      const res = await fetch('/api/token/auth', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setAuthed(true);
        setPassword('');
        loadKeys();
      } else {
        setLoginError(data?.error || 'Kata sandi salah.');
      }
    } catch (err: any) {
      setLoginError(err?.message || 'Gagal masuk. Coba lagi.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/token/auth', { method: 'DELETE', credentials: 'include' });
    setAuthed(false);
    setKeys([]);
  };

  const loadKeys = async () => {
    setKeysLoading(true);
    setActionError('');
    try {
      const res = await fetch('/api/token/keys', { credentials: 'include' });
      const data = await res.json();
      if (res.ok) setKeys(data.keys || []);
      else setActionError(data?.error || 'Gagal memuat apikey.');
    } catch (err: any) {
      setActionError(err?.message || 'Gagal memuat apikey.');
    } finally {
      setKeysLoading(false);
    }
  };

  const handleCreate = async () => {
    setActionError('');
    setCreating(true);
    try {
      const res = await fetch('/api/token/keys', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: newKeyNotes.trim() || undefined }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setNewKeyNotes('');
        await loadKeys();
      } else {
        setActionError(data?.error || 'Gagal membuat apikey.');
      }
    } catch (err: any) {
      setActionError(err?.message || 'Gagal membuat apikey.');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus apikey ini? Tindakan tidak bisa dibatalkan.')) return;
    setActionError('');
    try {
      const res = await fetch(`/api/token/keys/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok) {
        await loadKeys();
      } else {
        setActionError(data?.error || 'Gagal menghapus apikey.');
      }
    } catch (err: any) {
      setActionError(err?.message || 'Gagal menghapus apikey.');
    }
  };

  const handleReset = async (id: string) => {
    if (!confirm('Reset hitungan email apikey ini ke 0? Apikey akan aktif kembali.')) return;
    setActionError('');
    try {
      const res = await fetch(`/api/token/keys/${id}`, {
        method: 'PATCH',
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok) {
        await loadKeys();
      } else {
        setActionError(data?.error || 'Gagal mereset apikey.');
      }
    } catch (err: any) {
      setActionError(err?.message || 'Gagal mereset apikey.');
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ─── Loading screen ────────────────────────────────────────────
  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#0F1612] text-[#E8EDE5] flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-[#7E9788]" />
      </div>
    );
  }

  // ─── Password gate ──────────────────────────────────────────────
  if (!authed) {
    return (
      <div className="min-h-screen bg-[#0F1612] text-[#E8EDE5] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="bg-[#1A241E] border border-[#2A3A30] rounded-2xl p-6 sm:p-8 shadow-2xl">
            <div className="mb-6 text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-gradient-to-br from-[#3D5A46] to-[#2A4233] flex items-center justify-center text-white">
                <Lock className="w-5 h-5" />
              </div>
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white">
                Akses Admin
              </h1>
              <p className="text-[11px] text-[#7E9788] mt-1.5 leading-relaxed">
                Halaman ini terbatas. Masukkan kata sandi untuk mengelola apikey.
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label htmlFor="admin-password" className="block text-[11px] font-medium text-[#A8B5A6] mb-1.5">
                  Kata Sandi
                </label>
                <input
                  id="admin-password"
                  type="password"
                  autoFocus
                  autoComplete="off"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full text-sm px-4 py-3 rounded-xl border border-[#2A3A30] bg-[#0F1612] text-white placeholder:text-[#5C6B5E] focus:outline-none focus:border-[#4B7056] focus:ring-1 focus:ring-[#4B7056] transition-all"
                />
              </div>

              {loginError && (
                <p role="alert" className="text-[11px] text-[#D98080] leading-relaxed">
                  {loginError}
                </p>
              )}

              <button
                type="submit"
                disabled={loginLoading || !password}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-[#3D5A46] to-[#2A4233] hover:from-[#324B3A] hover:to-[#1F2F25] disabled:opacity-50 disabled:pointer-events-none transition-all shadow-md cursor-pointer"
              >
                {loginLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Memverifikasi...</span>
                  </>
                ) : (
                  <>
                    <KeyRound className="w-4 h-4" />
                    <span>Masuk</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ─── Admin dashboard ─────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0F1612] text-[#E8EDE5] flex flex-col">
      {/* Sticky top bar */}
      <header className="sticky top-0 z-20 bg-[#0F1612]/90 backdrop-blur-md border-b border-[#1F2A24]">
        <div className="max-w-4xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-[#3D5A46] to-[#2A4233] flex items-center justify-center text-white shrink-0">
              <Crown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-semibold tracking-tight text-white truncate">
                Admin · Apikey
              </p>
              <p className="text-[10px] text-[#7E9788] truncate hidden sm:block">
                Kelola apikey AM Premium
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={loadKeys}
              disabled={keysLoading}
              title="Muat ulang"
              className="flex items-center gap-1 text-[11px] text-[#A8B5A6] hover:text-white bg-[#1A241E] border border-[#2A3A30] px-2 sm:px-2.5 py-1.5 rounded-lg transition-colors hover:bg-[#22312A] disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${keysLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              onClick={handleLogout}
              title="Keluar"
              className="flex items-center gap-1 text-[11px] text-[#D98080] hover:text-white hover:bg-[#3A1F1F] border border-[#3A2424] px-2 sm:px-2.5 py-1.5 rounded-lg transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Keluar</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-5">
        {/* Create new apikey card */}
        <div className="rounded-2xl bg-[#1A241E] border border-[#2A3A30] p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-3">
            <Plus className="w-4 h-4 text-[#7CC8A2]" />
            <h2 className="text-sm sm:text-base font-semibold text-white">Buat Apikey Baru</h2>
          </div>
          <p className="text-[11px] text-[#7E9788] mb-4 leading-relaxed">
            1 apikey dapat dipakai untuk aktivasi 3 email. Setelah 3 email, apikey otomatis expired.
          </p>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={newKeyNotes}
              onChange={(e) => setNewKeyNotes(e.target.value)}
              placeholder="Catatan (opsional, misal: untuk user X)"
              maxLength={200}
              className="flex-1 text-xs px-3 py-2.5 rounded-lg border border-[#2A3A30] bg-[#0F1612] text-white placeholder:text-[#5C6B5E] focus:outline-none focus:border-[#4B7056] focus:ring-1 focus:ring-[#4B7056] transition-all"
            />
            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-[#3D5A46] to-[#2A4233] hover:from-[#324B3A] hover:to-[#1F2F25] disabled:opacity-50 disabled:pointer-events-none transition-all shadow-sm cursor-pointer whitespace-nowrap"
            >
              {creating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Membuat...</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>Buat Apikey</span>
                </>
              )}
            </button>
          </div>
          {actionError && (
            <p role="alert" className="text-[11px] text-[#D98080] mt-3 leading-relaxed">
              {actionError}
            </p>
          )}
        </div>

        {/* List of apikeys */}
        <div className="rounded-2xl bg-[#1A241E] border border-[#2A3A30] overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3 sm:py-4 border-b border-[#2A3A30]">
            <h2 className="text-sm sm:text-base font-semibold text-white">
              Daftar Apikey
            </h2>
            <span className="text-[11px] text-[#7E9788] font-mono">
              {keys.length} total
            </span>
          </div>

          {keys.length === 0 ? (
            <div className="px-4 sm:px-5 py-10 text-center text-[#7E9788]">
              <KeyRound className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-xs">Belum ada apikey. Buat baru di atas.</p>
            </div>
          ) : (
            <ul className="divide-y divide-[#1F2A24]">
              {keys.map((k) => {
                const remaining = Math.max(0, k.maxEmails - k.emailCount);
                const isExpired = k.expired || k.emailCount >= k.maxEmails;
                return (
                  <li key={k.id} className="px-4 sm:px-5 py-4 space-y-3">
                    {/* Key + copy + status */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1.5">
                          <code className="font-mono text-[11px] sm:text-xs text-[#E8EDE5] bg-[#0F1612] px-2 py-1 rounded border border-[#2A3A30] break-all">
                            {k.key}
                          </code>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-[10px] sm:text-[11px]">
                          <span
                            className={`px-2 py-0.5 rounded-full font-medium ${
                              isExpired
                                ? 'bg-[#3A1F1F] text-[#D98080] border border-[#4A2828]'
                                : 'bg-[#1F3A2A] text-[#7CC8A2] border border-[#2A4A38]'
                            }`}
                          >
                            {isExpired ? 'Expired' : `Aktif · sisa ${remaining}/${k.maxEmails}`}
                          </span>
                          <span className="text-[#5C6B5E]">
                            dibuat {new Date(k.createdAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                          </span>
                          {k.lastUsedAt && (
                            <span className="text-[#5C6B5E]">
                              · dipakai {new Date(k.lastUsedAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                            </span>
                          )}
                        </div>
                        {k.lastEmail && (
                          <p className="text-[10px] text-[#5C6B5E] mt-1 truncate">
                            email terakhir: <span className="font-mono">{k.lastEmail}</span>
                          </p>
                        )}
                        {k.notes && (
                          <p className="text-[10px] text-[#7E9788] mt-1 italic">"{k.notes}"</p>
                        )}
                      </div>

                      {/* Copy + actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleCopy(k.key, k.id)}
                          title="Salin apikey"
                          className="p-1.5 rounded-md text-[#A8B5A6] hover:text-white hover:bg-[#22312A] transition-colors cursor-pointer"
                        >
                          {copiedId === k.id ? (
                            <Check className="w-3.5 h-3.5 text-[#7CC8A2]" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                        {isExpired && (
                          <button
                            onClick={() => handleReset(k.id)}
                            title="Reset hitungan ke 0"
                            className="p-1.5 rounded-md text-[#A8B5A6] hover:text-white hover:bg-[#22312A] transition-colors cursor-pointer"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(k.id)}
                          title="Hapus apikey"
                          className="p-1.5 rounded-md text-[#D98080] hover:text-white hover:bg-[#3A1F1F] transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <p className="text-center text-[10px] text-[#5C6B5E] py-2 leading-relaxed">
          Halaman ini private — jangan bagikan URL ke siapapun.
        </p>
      </main>
    </div>
  );
}
