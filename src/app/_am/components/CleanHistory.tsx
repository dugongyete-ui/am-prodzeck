import React, { useState } from 'react';
import { ActivityLogItem } from '../types';
import { CheckCircle2, Copy, Check, Trash2, Calendar, Crown } from 'lucide-react';

interface CleanHistoryProps {
  history: ActivityLogItem[];
  onClearHistory: () => void;
}

export const CleanHistory: React.FC<CleanHistoryProps> = ({
  history,
  onClearHistory,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const verifiedItems = history.filter((item) => item.type === 'verify-link' && item.ok);

  if (verifiedItems.length === 0) {
    return (
      <div className="w-full max-w-xl mx-auto bg-white border border-[#E7EBE4] rounded-2xl p-6 sm:p-8 text-center text-xs text-[#7B8B7E]">
        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[#EDF3EE] flex items-center justify-center text-[#3D5B46]">
          <Crown className="w-5 h-5" />
        </div>
        <h3 className="font-semibold text-sm sm:text-base text-[#27372D]">Belum Ada Akun Teraktivasi</h3>
        <p className="mt-1.5 text-[#78887B] leading-relaxed max-w-md mx-auto">
          Akun yang sudah Anda aktivasi akan tampil di sini dengan token aktivasi masing-masing.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-xl mx-auto bg-white border border-[#E6EAE2] rounded-2xl p-4 sm:p-6 shadow-[0_4px_20px_-4px_rgba(35,48,38,0.04)]">
      <div className="flex items-center justify-between pb-4 border-b border-[#F0F3EE] gap-2">
        <div className="min-w-0">
          <h2 className="text-sm sm:text-base font-semibold text-[#1F2C24]">Riwayat Aktivasi</h2>
          <p className="text-[11px] sm:text-xs text-[#718174] mt-0.5">
            Total {verifiedItems.length} akun aktif tersimpan
          </p>
        </div>
        <button
          onClick={onClearHistory}
          className="flex items-center gap-1 text-[11px] sm:text-xs text-[#875555] hover:text-[#AC3B3B] hover:bg-[#FDF2F2] px-2 sm:px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer shrink-0"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Hapus</span>
        </button>
      </div>

      <div className="divide-y divide-[#F1F4EE] mt-2">
        {verifiedItems.map((item) => {
          const email = item.response?.data?.email || item.payload?.email || 'Akun Pengguna';
          const token = item.response?.data?.idToken;
          const uid = item.response?.data?.uid;

          return (
            <div key={item.id} className="py-3 sm:py-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#3E5C47] to-[#2A4233] text-white flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <span className="font-semibold text-xs sm:text-sm text-[#202E24] truncate block">{email}</span>
                    {uid && (
                      <span className="text-[10px] sm:text-[11px] font-mono text-[#6A7B6E] block truncate">
                        UID: {uid}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 text-[10px] sm:text-[11px] text-[#7E8F81] font-mono shrink-0">
                  <Calendar className="w-3 h-3 text-[#95A598]" />
                  <span>{new Date(item.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>

              {token && (
                <div className="flex items-center justify-between bg-[#F8FAF6] p-2 rounded-lg border border-[#E7EFE5] text-[11px] gap-2">
                  <span className="font-mono text-[#3D5243] truncate">
                    {token.substring(0, 32)}...
                  </span>
                  <button
                    onClick={() => handleCopy(token, item.id)}
                    className="flex items-center gap-1 text-[11px] text-[#33593D] hover:text-[#183520] px-2 py-0.5 rounded transition-colors font-medium cursor-pointer shrink-0"
                  >
                    {copiedId === item.id ? (
                      <>
                        <Check className="w-3 h-3 text-[#305C3C]" />
                        <span>Tersalin</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Salin</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
