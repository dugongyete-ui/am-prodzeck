import React from 'react';
import { Crown, History, RefreshCw } from 'lucide-react';

interface HeaderProps {
  activeView: 'auth' | 'history';
  onSelectView: (view: 'auth' | 'history') => void;
  onResetAll: () => void;
  historyCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeView,
  onSelectView,
  onResetAll,
  historyCount,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-[#F8F9F6]/90 backdrop-blur-md border-b border-[#E7EBE4]">
      <div className="max-w-4xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2">
        {/* Brand Zone - Clean single wordmark */}
        <div className="flex shrink-0 items-center gap-2">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-[#3D5A46] to-[#2A4233] flex items-center justify-center text-white shadow-sm shrink-0">
            <Crown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
          <button
            onClick={() => onSelectView('auth')}
            className="whitespace-nowrap text-[13px] sm:text-lg font-semibold tracking-tight text-[#1F2C24] hover:text-[#3D5A46] transition-colors"
          >
            Dzeck Premium
          </button>
        </div>

        {/* Clean, professional navigation links */}
        <nav className="flex shrink-0 items-center gap-1.5 sm:gap-5 text-[10px] sm:text-sm font-medium">
          <button
            onClick={() => onSelectView('auth')}
            className={`transition-colors py-1.5 px-1 sm:px-0 relative ${
              activeView === 'auth'
                ? 'text-[#24362A] font-semibold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[#4E6F58]'
                : 'text-[#6C786F] hover:text-[#24362A]'
            }`}
          >
            Aktivasi
          </button>
          <button
            onClick={() => onSelectView('history')}
            className={`transition-colors py-1.5 px-1 sm:px-0 relative flex items-center gap-1 ${
              activeView === 'history'
                ? 'text-[#24362A] font-semibold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[#4E6F58]'
                : 'text-[#6C786F] hover:text-[#24362A]'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Akun</span>
            {historyCount > 0 && (
              <span className="text-[10px] sm:text-[11px] font-mono text-[#5A6D5E]">
                ({historyCount})
              </span>
            )}
          </button>
        </nav>

        {/* Primary Action: Reset Session */}
        <div className="flex items-center gap-2">
          <button
            onClick={onResetAll}
            title="Mulai aktivasi baru"
            className="flex shrink-0 items-center gap-1 text-[11px] sm:text-xs font-medium text-[#3D5A46] hover:text-[#1F2C24] bg-white border border-[#DDE5D6] px-2 sm:px-3 py-1.5 rounded-lg transition-colors hover:bg-[#F2F5F0]"
          >
            <RefreshCw className="w-3 h-3 text-[#3D5A46]" />
            <span className="hidden sm:inline">Mulai Baru</span>
          </button>
        </div>
      </div>
    </header>
  );
};
