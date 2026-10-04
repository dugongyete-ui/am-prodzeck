/* eslint-disable react-hooks/set-state-in-effect */
import React, { useState, useEffect, useRef } from 'react';
import { Mail, ArrowRight, CheckCircle2, Clipboard, Loader2, KeyRound, Copy, Check, RotateCcw, Eye, EyeOff, MessageCircle } from 'lucide-react';
import { isEmail, isOobCode, isUrl } from '../services/api';
import { SessionData } from '../types';

interface AutoAuthFlowProps {
  currentSession: SessionData | null;
  isLoading: boolean;
  apiKey: string;
  setApiKey: (k: string) => void;
  apiKeyRemaining: number | null;
  apiKeyMax: number;
  contactHint: string | null;
  whatsappUrl: string | null;
  onSendEmail: (email: string) => Promise<boolean>;
  onVerifyLinkOrCode: (input: string) => Promise<boolean>;
  onResetSession: () => void;
}

export const AutoAuthFlow: React.FC<AutoAuthFlowProps> = ({
  currentSession,
  isLoading,
  apiKey,
  setApiKey,
  apiKeyRemaining,
  apiKeyMax,
  contactHint,
  whatsappUrl,
  onSendEmail,
  onVerifyLinkOrCode,
  onResetSession,
}) => {
  // Step 1: 'email' | Step 2: 'awaiting_link' | Step 3: 'verified'
  const [step, setStep] = useState<'email' | 'awaiting_link' | 'verified'>('email');
  const [emailInput, setEmailInput] = useState('');
  const [linkInput, setLinkInput] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [clipboardNotice, setClipboardNotice] = useState<{
    message: string;
    type: 'info' | 'error';
  } | null>(null);

  const linkInputRef = useRef<HTMLInputElement>(null);

  const showClipboardNotice = (message: string, type: 'info' | 'error' = 'info') => {
    setClipboardNotice({ message, type });
  };

  const getVerificationInputError = (value: string) => {
    const trimmed = value.trim();

    if (isEmail(trimmed)) {
      const inboxEmail = currentSession?.email || emailInput;
      return inboxEmail
        ? `Yang tersalin email, bukan tautan. Salin tautan aktivasi dari email ${inboxEmail}.`
        : 'Yang tersalin email, bukan tautan. Salin tautan aktivasi dari email Anda.';
    }

    if (!isUrl(trimmed) && !isOobCode(trimmed)) {
      return 'Format tidak dikenali. Tempel tautan atau kode aktivasi dari email Anda.';
    }

    return null;
  };

  // Sync step based on session state
  useEffect(() => {
    if (currentSession?.accountData?.idToken || currentSession?.verifiedAt) {
      setStep('verified');
    } else if (currentSession?.email && currentSession?.sessionKey) {
      setEmailInput(currentSession.email);
      setStep('awaiting_link');
    } else {
      setStep('email');
    }
  }, [currentSession]);

  // Focus link input when entering Step 2
  useEffect(() => {
    if (step === 'awaiting_link') {
      setTimeout(() => {
        linkInputRef.current?.focus();
      }, 200);
    }
  }, [step]);

  // Handle Step 1: Send Email
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim() || isLoading) return;

    const success = await onSendEmail(emailInput.trim());
    if (success) {
      setStep('awaiting_link');
      setLinkInput('');
    }
  };

  // Handle Step 2: Auto-verify when link is provided
  const handleVerify = async (textToVerify: string) => {
    const trimmed = textToVerify.trim();
    if (!trimmed || isLoading) return false;

    const inputError = getVerificationInputError(trimmed);
    if (inputError) {
      showClipboardNotice(inputError, 'error');
      return false;
    }

    setClipboardNotice(null);
    const success = await onVerifyLinkOrCode(trimmed);
    if (success) {
      setStep('verified');
    }
    return success;
  };

  // Handle Paste Event inside link input: auto-triggers verification
  const handleLinkPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedText = e.clipboardData.getData('text').trim();
    if (!pastedText || isLoading) return;

    e.preventDefault();
    const inputError = getVerificationInputError(pastedText);
    if (inputError) {
      setLinkInput('');
      showClipboardNotice(inputError, 'error');
      return;
    }

    setLinkInput(pastedText);
    showClipboardNotice('Tautan terdeteksi. Mengaktifkan otomatis...');
    setTimeout(() => {
      handleVerify(pastedText);
    }, 100);
  };

  // Handle "Tempel Otomatis dari Papan Klip" button click
  const handleAutoPasteFromClipboard = async () => {
    try {
      if (!navigator.clipboard?.readText) {
        showClipboardNotice(
          'Browser membatasi akses clipboard otomatis. Tekan Ctrl+V / Cmd+V di kolom input.',
          'error'
        );
        linkInputRef.current?.focus();
        return;
      }

      const text = await navigator.clipboard.readText();
      const trimmed = text.trim();

      if (!trimmed) {
        showClipboardNotice('Clipboard kosong. Salin tautan aktivasi dari email dulu.', 'error');
        return;
      }

      const inputError = getVerificationInputError(trimmed);
      if (inputError) {
        setLinkInput('');
        showClipboardNotice(inputError, 'error');
        return;
      }

      setLinkInput(trimmed);
      showClipboardNotice('Tautan terdeteksi. Mengaktifkan otomatis...');
      await handleVerify(trimmed);
    } catch {
      showClipboardNotice('Izinkan akses clipboard atau tempel manual dengan Ctrl+V di kolom bawah.', 'error');
      linkInputRef.current?.focus();
    }
  };

  const handleCopyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  return (
    <div className="w-full max-w-xl mx-auto">
      {/* Step Indicators with Zero-Pill Typography */}
      <div className="flex items-center justify-between gap-1.5 pb-6 mb-8 border-b border-[#E8ECE4] text-[10px] sm:text-xs">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <span
            className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center font-medium transition-colors shrink-0 ${
              step === 'email'
                ? 'bg-[#3E5C47] text-white'
                : 'bg-[#EBF2EC] text-[#334D3A]'
            }`}
          >
            1
          </span>
          <span className={`truncate ${step === 'email' ? 'font-semibold text-[#1C2920]' : 'text-[#6C7C70]'}`}>
            Email
          </span>
        </div>

        <div className="h-[1px] flex-1 min-w-[8px] mx-1 sm:mx-4 bg-[#E3E8DE]" />

        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <span
            className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center font-medium transition-colors shrink-0 ${
              step === 'awaiting_link'
                ? 'bg-[#3E5C47] text-white'
                : step === 'verified'
                ? 'bg-[#EBF2EC] text-[#334D3A]'
                : 'bg-[#F0F2ED] text-[#8C9B8F]'
            }`}
          >
            2
          </span>
          <span className={`truncate ${step === 'awaiting_link' ? 'font-semibold text-[#1C2920]' : 'text-[#6C7C70]'}`}>
            Verifikasi
          </span>
        </div>

        <div className="h-[1px] flex-1 min-w-[8px] mx-1 sm:mx-4 bg-[#E3E8DE]" />

        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <span
            className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center font-medium transition-colors shrink-0 ${
              step === 'verified'
                ? 'bg-[#3E5C47] text-white'
                : 'bg-[#F0F2ED] text-[#8C9B8F]'
            }`}
          >
            3
          </span>
          <span className={`truncate ${step === 'verified' ? 'font-semibold text-[#1C2920]' : 'text-[#6C7C70]'}`}>
            Aktif
          </span>
        </div>
      </div>

      {/* STEP 1: EMAIL INPUT */}
      {step === 'email' && (
        <div className="bg-white border border-[#E5EAE2] rounded-2xl p-5 sm:p-8 shadow-[0_4px_20px_-4px_rgba(35,48,38,0.04)] animate-in fade-in duration-200">
          <div className="mb-6 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-[#EDF3EE] flex items-center justify-center text-[#3D5B46]">
              <Mail className="w-5 h-5" />
            </div>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-[#1A261E]">
              Aktifkan Alight Motion Premium
            </h2>
            <p className="text-xs text-[#6F7F72] mt-1.5 leading-relaxed max-w-md mx-auto">
              Premium aktif 1 tahun setelah verifikasi email. Masukkan email aktif, kami kirim tautan aktivasi ke kotak masuk Anda.
            </p>
          </div>

          <form onSubmit={handleEmailSubmit} className="space-y-4">
            {/* Apikey input */}
            <div>
              <label htmlFor="apikey" className="block text-xs font-medium text-[#37473C] mb-1.5">
                Apikey AM Premium
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA89D] pointer-events-none" />
                <input
                  id="apikey"
                  type={showApiKey ? 'text' : 'password'}
                  autoComplete="off"
                  spellCheck={false}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="dzk_..."
                  className="w-full text-xs font-mono pl-9 pr-10 py-3 rounded-xl border border-[#DCE3D8] bg-[#FAFBF9] text-[#1E2B21] placeholder:text-[#9AA79D] placeholder:font-sans focus:outline-none focus:border-[#4B7056] focus:ring-1 focus:ring-[#4B7056] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey((v) => !v)}
                  title={showApiKey ? 'Sembunyikan' : 'Tampilkan'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-[#7A8A7D] hover:text-[#1F2C24] hover:bg-[#F1F4EE] transition-colors cursor-pointer"
                >
                  {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              {/* Contact hint for missing / invalid / expired apikey */}
              {contactHint && (
                <div className="mt-2.5 flex items-start gap-2 p-2.5 rounded-lg bg-[#FBF4E6] border border-[#E8D9B0] text-[#7A5A1F]">
                  <MessageCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <p className="text-[11px] leading-relaxed">
                    {contactHint}
                    {whatsappUrl && (
                      <a
                        href={whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold underline ml-1"
                      >
                        wa.me/6282120056647
                      </a>
                    )}
                  </p>
                </div>
              )}
              {/* Remaining-quota hint when key is valid */}
              {!contactHint && apiKeyRemaining !== null && apiKeyRemaining >= 0 && (
                <p className="mt-1.5 text-[10px] text-[#7A8A7D]">
                  Sisa kuota email: <span className="font-semibold text-[#2A4233]">{apiKeyRemaining}/{apiKeyMax}</span>
                </p>
              )}
            </div>

            <div>
              <label htmlFor="email" className="block text-xs font-medium text-[#37473C] mb-1.5">
                Email Aktif
              </label>
              <input
                id="email"
                type="email"
                required
                autoFocus
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="nama@email.com"
                className="w-full text-sm px-4 py-3 rounded-xl border border-[#DCE3D8] bg-[#FAFBF9] text-[#1E2B21] placeholder:text-[#9AA79D] focus:outline-none focus:border-[#4B7056] focus:ring-1 focus:ring-[#4B7056] transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !emailInput.trim() || !apiKey.trim()}
              className="w-full flex items-center justify-center gap-2 py-3 px-5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-[#3D5A46] to-[#324B3A] hover:from-[#324B3A] hover:to-[#283C2E] active:from-[#283C2E] disabled:opacity-50 disabled:pointer-events-none transition-all shadow-md cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Mengirim tautan...</span>
                </>
              ) : (
                <>
                  <span>Kirim Tautan Aktivasi</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* STEP 2: AWAITING LINK & AUTO-PASTE */}
      {step === 'awaiting_link' && (
        <div className="bg-white border border-[#E5EAE2] rounded-2xl p-5 sm:p-8 shadow-[0_4px_20px_-4px_rgba(35,48,38,0.04)] animate-in fade-in duration-200">
          <div className="mb-6 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-[#EDF3EE] flex items-center justify-center text-[#3D5B46]">
              <KeyRound className="w-5 h-5" />
            </div>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-[#1A261E]">
              Cek Email Anda
            </h2>
            <p className="text-xs text-[#6F7F72] mt-1.5 leading-relaxed max-w-md mx-auto">
              Tautan aktivasi sudah dikirim ke <strong className="font-semibold text-[#202E24] break-all">{emailInput}</strong>. Buka kotak masuk atau folder spam, salin tautannya, tempel di bawah ini.
            </p>
          </div>

          {/* Dedicated Smart Auto-Paste Action */}
          <div className="mb-5">
            <button
              type="button"
              onClick={handleAutoPasteFromClipboard}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-3 px-3 sm:px-4 rounded-xl text-xs font-semibold text-[#27402F] bg-[#EEF4EF] hover:bg-[#E2EBE3] active:bg-[#D5E2D7] border border-[#D5E3D8] transition-all cursor-pointer shadow-2xs"
            >
              <Clipboard className="w-4 h-4 text-[#3D5A46] shrink-0" />
              <span className="text-center leading-tight">Tempel Otomatis dari Clipboard</span>
            </button>

            {clipboardNotice && (
              <p
                role={clipboardNotice.type === 'error' ? 'alert' : 'status'}
                className={`text-[11px] mt-2 text-center leading-relaxed ${
                  clipboardNotice.type === 'error' ? 'text-[#8F3535]' : 'text-[#55695A]'
                }`}
              >
                {clipboardNotice.message}
              </p>
            )}
          </div>

          <div className="relative flex items-center py-2">
            <div className="flex-grow border-t border-[#EBEFE8]" />
            <span className="flex-shrink mx-3 text-[11px] text-[#869689]">atau tempel manual</span>
            <div className="flex-grow border-t border-[#EBEFE8]" />
          </div>

          {/* Form input with auto-paste listener */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleVerify(linkInput);
            }}
            className="space-y-4 mt-3"
          >
            <div>
              <label htmlFor="verify-link" className="block text-xs font-medium text-[#37473C] mb-1.5">
                Tautan dari Email
              </label>
              <input
                id="verify-link"
                ref={linkInputRef}
                type="text"
                value={linkInput}
                onChange={(e) => {
                  setLinkInput(e.target.value);
                  setClipboardNotice(null);
                }}
                onPaste={handleLinkPaste}
                placeholder="Tempel tautan aktivasi di sini..."
                className="w-full text-xs font-mono px-4 py-3 rounded-xl border border-[#DCE3D8] bg-[#FAFBF9] text-[#1E2B21] placeholder:text-[#9AA79D] placeholder:font-sans focus:outline-none focus:border-[#4B7056] focus:ring-1 focus:ring-[#4B7056] transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !linkInput.trim()}
              className="w-full flex items-center justify-center gap-2 py-3 px-5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-[#3D5A46] to-[#324B3A] hover:from-[#324B3A] hover:to-[#283C2E] active:from-[#283C2E] disabled:opacity-50 disabled:pointer-events-none transition-all shadow-md cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Mengaktifkan...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Aktifkan Premium</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-5 text-center">
            <button
              type="button"
              onClick={() => setStep('email')}
              className="text-xs text-[#6F7F72] hover:text-[#1F2C24] transition-colors inline-flex items-center gap-1"
            >
              <span>Salah ketik email? Ganti alamat email</span>
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: VERIFIED SUCCESS PROFILE */}
      {step === 'verified' && (
        <div className="bg-white border border-[#E5EAE2] rounded-2xl p-5 sm:p-8 shadow-[0_4px_20px_-4px_rgba(35,48,38,0.04)] animate-in fade-in duration-200">
          <div className="mb-6 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[#EAF5ED] flex items-center justify-center text-[#2F6D43]">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-[#1A261E]">
              Premium Aktif!
            </h2>
            <p className="text-xs text-[#657969] mt-1">
              Alight Motion Premium sudah aktif 1 tahun di akun Anda. Fitur premium terbuka penuh, tanpa watermark.
            </p>
          </div>

          <div className="rounded-xl bg-[#FAFBF9] border border-[#E5EBE1] p-4 sm:p-5 space-y-3.5 mb-6 text-xs">
            <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-[#ECEFE7]">
              <span className="text-[#6C7E70] shrink-0">Email</span>
              <span className="font-semibold text-[#1C2920] truncate text-right">
                {currentSession?.accountData?.email || currentSession?.email || emailInput}
              </span>
            </div>

            {currentSession?.accountData?.uid && (
              <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-[#ECEFE7]">
                <span className="text-[#6C7E70] shrink-0">User ID (UID)</span>
                <span className="font-mono text-[#243528] text-[11px] truncate text-right">
                  {currentSession.accountData.uid}
                </span>
              </div>
            )}

            {currentSession?.accountData?.orderId && (
              <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-[#ECEFE7]">
                <span className="text-[#6C7E70] shrink-0">Akun Sosmed</span>
                <span className="font-mono text-[#243528] text-[11px]">
                  off.dzcx
                </span>
              </div>
            )}

            {currentSession?.accountData?.idToken && (
              <div className="pt-1">
                <div className="flex items-center justify-between mb-1.5 gap-2">
                  <span className="text-[#6C7E70] font-medium">Token Aktivasi</span>
                  <button
                    type="button"
                    onClick={() => handleCopyToken(currentSession.accountData!.idToken!)}
                    className="flex items-center gap-1 text-[11px] font-medium text-[#30543B] hover:text-[#183120] bg-[#EEF4EF] hover:bg-[#E1EBE2] px-2.5 py-1 rounded-md transition-colors cursor-pointer shrink-0"
                  >
                    {copiedToken ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-[#2C663D]" />
                        <span>Tersalin!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Salin Token</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="p-3 bg-white rounded-lg border border-[#DCE3D8] text-[11px] font-mono text-[#253629] break-all max-h-24 overflow-y-auto leading-relaxed tabular-nums select-all">
                  {currentSession.accountData.idToken}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                onResetSession();
                setStep('email');
                setEmailInput('');
                setLinkInput('');
              }}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-semibold text-[#374C3D] bg-[#F1F4EE] hover:bg-[#E5EAE2] transition-all cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Aktifkan Akun Lain</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
