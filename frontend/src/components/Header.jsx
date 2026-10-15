import React from 'react';

export default function Header({ activeTab, setActiveTab }) {
  return (
    <header className="w-full bg-[#0d5537] flex flex-col md:flex-row justify-between items-center px-6 md:px-12 py-4 mb-8 border-b border-[var(--card-border)] shadow-md">
      <div className="flex items-center gap-3 mb-3 md:mb-0">
        <img
          src="/logo_mentor4.svg"
          alt="Mentor logo"
          className="h-10 w-auto"
        />
      </div>
      <nav className="flex gap-2 bg-[rgba(49,241,113,0.6)] p-1 rounded-lg border border-[var(--card-border)]">
        <button
          type="button"
          className={`px-4 py-2 rounded-md text-sm font-semibold transition-all duration-200 cursor-pointer ${
            activeTab === 'public'
              ? 'bg-[#005c1f] text-white shadow-sm'
              : 'text-[#121416] hover:bg-emerald-600/20'
          }`}
          onClick={() => setActiveTab('public')}
        >
          Nowe zgłoszenie
        </button>
        <button
          type="button"
          className={`px-4 py-2 rounded-md text-sm font-semibold transition-all duration-200 cursor-pointer ${
            activeTab === 'admin'
              ? 'bg-[#005c1f] text-white shadow-sm'
              : 'text-[#121416] hover:bg-emerald-600/20'
          }`}
          onClick={() => setActiveTab('admin')}
        >
          Panel pracownika
        </button>
      </nav>
    </header>
  );
}
