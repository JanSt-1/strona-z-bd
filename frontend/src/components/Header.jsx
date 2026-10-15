import React from 'react';

export default function Header({ activeTab, setActiveTab }) {
  return (
    <header className="w-full bg-[#0d5537] flex flex-col md:flex-row justify-between items-center px-6 md:px-12 py-4 mb-8 shadow-sm">
      <div className="flex items-center gap-3 mb-3 md:mb-0">
        <img
          src="/logo_mentor4.svg"
          alt="Mentor logo"
          className="h-10 w-auto"
        />
      </div>
      <nav className="flex gap-2 bg-black/20 p-1 rounded-lg">
        <button
          type="button"
          className={`px-4 py-2 rounded-md text-sm font-semibold transition-all duration-200 cursor-pointer ${
            activeTab === 'public'
              ? 'bg-[var(--primary)] text-[var(--text-white)] shadow-sm'
              : 'text-[var(--text-white)]/80 hover:bg-white/10'
          }`}
          onClick={() => setActiveTab('public')}
        >
          Nowe zgłoszenie
        </button>
        <button
          type="button"
          className={`px-4 py-2 rounded-md text-sm font-semibold transition-all duration-200 cursor-pointer ${
            activeTab === 'admin'
              ? 'bg-[var(--primary)] text-[var(--text-white)] shadow-sm'
              : 'text-[var(--text-white)]/80 hover:bg-white/10'
          }`}
          onClick={() => setActiveTab('admin')}
        >
          Panel pracownika
        </button>
      </nav>
    </header>
  );
}
