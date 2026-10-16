import React from 'react';

export default function Header({ activeTab, setActiveTab }) {
  return (
    <header className="w-full bg-primary-dark flex flex-col md:flex-row justify-between items-center px-4 sm:px-8 md:px-12 py-3.5 sm:py-4 mb-6 sm:mb-8 shadow-sm gap-4 md:gap-2">
      <div className="flex items-center justify-center md:justify-start w-full md:w-auto">
        <img
          src="/logo_mentor4.svg"
          alt="Mentor logo"
          className="h-9 sm:h-10 w-auto"
        />
      </div>
      <nav className="flex flex-col sm:flex-row w-full sm:w-auto gap-2 bg-ink/30 p-1.5 rounded-lg">
        <button
          type="button"
          className={`w-full sm:w-auto px-4 py-2.5 sm:py-2 rounded-md text-sm font-semibold transition-all duration-200 cursor-pointer text-center ${
            activeTab === 'public'
              ? 'bg-[var(--primary)] text-[var(--text-white)] shadow-sm'
              : 'text-[var(--text-white)]/80 hover:bg-card/10'
          }`}
          onClick={() => setActiveTab('public')}
        >
          Nowe zgłoszenie
        </button>
        <button
          type="button"
          className={`w-full sm:w-auto px-4 py-2.5 sm:py-2 rounded-md text-sm font-semibold transition-all duration-200 cursor-pointer text-center ${
            activeTab === 'admin'
              ? 'bg-[var(--primary)] text-[var(--text-white)] shadow-sm'
              : 'text-[var(--text-white)]/80 hover:bg-card/10'
          }`}
          onClick={() => setActiveTab('admin')}
        >
          Panel pracownika
        </button>
      </nav>
    </header>
  );
}
