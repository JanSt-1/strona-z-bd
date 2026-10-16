import React, { useState } from 'react';
import {
  PRZEDMIOTY_LISTA,
  NUMERY_KIERUNKOWE,
  EMPTY_TICKET_FORM,
  isSerialNumberAllowed,
  validatePurchaseDate
} from '../constants';
import { ticketApi } from '../api';
import Alert from '../components/Alert';

const TODAY_ISO = new Date().toISOString().split('T')[0];

export default function PublicTicketForm() {
  const [formData, setFormData] = useState(EMPTY_TICKET_FORM);
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState(null);

  function showAlert(message, type = 'success') {
    setAlert({ message, type });
    setTimeout(() => setAlert(null), 6000);
  }

  // Obsługa wpisywania numeru telefonu (i wyłącznie cyfry po +48)
  function handlePhoneChange(e) {
    let val = e.target.value;
    let digits = val.replace(/\D/g, '');

    if (digits.startsWith('48')) {
      digits = digits.slice(2);
    }
    digits = digits.slice(0, 9);

    const formatted =
      '+48 ' +
      [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6)]
        .filter(Boolean)
        .join(' ');

    setFormData((prev) => ({ ...prev, numer_telefonu: formatted }));
  }

  function handlePhoneKeyDown(e) {
    if (
      (e.key === 'Backspace' || e.key === 'Delete') &&
      e.target.selectionStart <= 4 &&
      e.target.selectionEnd <= 4
    ) {
      e.preventDefault();
    }
  }

  // Obsługa wpisywania 7 cyfr telefonu firmowego
  function handleCompanyPhone7Change(e) {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 7);
    setFormData((prev) => ({ ...prev, telefon_firmowy_7: digits }));
  }

  // Obsługa wpisywania kodu pocztowego (XX-XXX z automatycznym myślnikiem)
  function handlePostalCodeChange(e) {
    const val = e.target.value;
    const digits = val.replace(/\D/g, '').slice(0, 5);

    let formatted = digits;
    if (digits.length > 2) {
      formatted = `${digits.slice(0, 2)}-${digits.slice(2)}`;
    } else if (
      digits.length === 2 &&
      val.length === 2 &&
      e.nativeEvent?.inputType !== 'deleteContentBackward'
    ) {
      formatted = `${digits}-`;
    }

    setFormData((prev) => ({ ...prev, kod_pocztowy: formatted }));
  }

  function handlePostalCodeKeyDown(e) {
    if (e.key === 'Backspace' && formData.kod_pocztowy.endsWith('-')) {
      e.preventDefault();
      setFormData((prev) => ({ ...prev, kod_pocztowy: prev.kod_pocztowy.slice(0, -2) }));
    }
  }

  // Obsługa wpisywania numeru NIP (dokładnie 10 cyfr)
  function handleNipChange(e) {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
    setFormData((prev) => ({ ...prev, nip: digits }));
  }

  // Obsługa wyboru przedmiotu zgłoszenia
  function handleSubjectChange(e) {
    const val = e.target.value;
    const allowed = isSerialNumberAllowed(val);
    setFormData((prev) => ({
      ...prev,
      przedmiot_zgloszenia: val,
      numer_seryjny: allowed ? prev.numer_seryjny : ''
    }));
  }

  // Czyszczenie formularza
  function handleReset() {
    setFormData(EMPTY_TICKET_FORM);
    setAlert(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const cleanDigits = formData.numer_telefonu.replace(/\D/g, '').replace(/^48/, '');
    const validationError = [
      [/\d/.test(formData.imie), 'Pole "Imię" nie może zawierać cyfr.'],
      [/\d/.test(formData.nazwisko), 'Pole "Nazwisko" nie może zawierać cyfr.'],
      [cleanDigits.length < 9, 'Proszę podać pełny, 9-cyfrowy numer telefonu po prefiksie +48.'],
      [!/^\d{2}-\d{3}$/.test(formData.kod_pocztowy.trim()), 'Kod pocztowy musi mieć format XX-XXX (np. 00-001).'],
      [!formData.przedmiot_zgloszenia, 'Proszę wybrać przedmiot zgłoszenia z listy.'],
      [
        isSerialNumberAllowed(formData.przedmiot_zgloszenia) && !formData.numer_seryjny.trim(),
        'Pole "Numer seryjny (S/N)" jest obowiązkowe dla wybranego przedmiotu zgłoszenia.'
      ],
      [Boolean(validatePurchaseDate(formData.data_zakupu)), validatePurchaseDate(formData.data_zakupu)],
      [!formData.numer_fv.trim(), 'Pole "Numer faktury / paragonu" jest wymagane.'],
      [!/^\d{10}$/.test(formData.nip.trim()), 'Pole "NIP" jest wymagane i musi składać się z dokładnie 10 cyfr (bez myślników).'],
      [!formData.telefon_kierunkowy, 'Proszę wybrać 2-cyfrowy numer kierunkowy dla telefonu firmowego.'],
      [formData.telefon_firmowy_7.length < 7, 'Dla telefonu firmowego należy podać pełne 7 cyfr po numerze kierunkowym.'],
      [!formData.zgoda_rodo, 'Wymagane jest potwierdzenie zapoznania się z informacją o przetwarzaniu danych osobowych.']
    ].find(([invalid]) => invalid);

    if (validationError) {
      showAlert(validationError[1], 'error');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        website: formData.website || '',
        imie: formData.imie,
        nazwisko: formData.nazwisko,
        nazwa_firmy: formData.nazwa_firmy ? formData.nazwa_firmy.trim() : null,
        numer_telefonu: formData.numer_telefonu.replace(/\s+/g, ''),
        email: formData.email,
        adres: formData.adres,
        kod_pocztowy: formData.kod_pocztowy.trim(),
        miasto: formData.miasto.trim(),
        przedmiot_zgloszenia: formData.przedmiot_zgloszenia,
        numer_seryjny:
          isSerialNumberAllowed(formData.przedmiot_zgloszenia) && formData.numer_seryjny
            ? formData.numer_seryjny.trim()
            : null,
        data_zakupu: formData.data_zakupu,
        numer_fv: formData.numer_fv.trim(),
        nip: formData.nip.trim(),
        opis_usterki: formData.opis_usterki,
        zgoda_rodo: formData.zgoda_rodo
      };

      const data = await ticketApi.createTicket(payload);
      showAlert(`Dziękujemy! ${data.message} Numer zgłoszenia: #${data.id}`, 'success');
      setFormData({ ...EMPTY_TICKET_FORM, numer_telefonu: '+48 ' });
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  const isSnActive = isSerialNumberAllowed(formData.przedmiot_zgloszenia);

  return (
    <main className="app-card">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-ink mb-1">Zgłoś problem serwisowy</h2>
        <p className="text-sm text-ink">
          Wypełnij poniższy formularz. Skontaktujemy się z Tobą po zarejestrowaniu zgłoszenia.
        </p>
      </div>

      <Alert alert={alert} />

      <form onSubmit={handleSubmit} noValidate>
        {/* Honeypot: ukryte pole anty-spamowe dla botów */}
        <div className="hidden" aria-hidden="true">
          <label htmlFor="website">Strona internetowa</label>
          <input
            type="text"
            id="website"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={formData.website}
            onChange={(e) => setFormData({ ...formData, website: e.target.value })}
          />
        </div>

        {/* Część 1: Dane osoby zgłaszającej */}
        <section className="mb-8">
          <div className="form-section-header">
            <span className="form-section-badge">1</span>
            <h3 className="form-section-title">Dane osoby zgłaszającej</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="w-full">
              <label htmlFor="imie" className="app-label">Imię *</label>
              <input
                type="text"
                id="imie"
                required
                placeholder="np. Jan"
                value={formData.imie}
                onChange={(e) => setFormData({ ...formData, imie: e.target.value })}
                className="app-input w-full"
              />
            </div>
            <div className="w-full">
              <label htmlFor="nazwisko" className="app-label">Nazwisko *</label>
              <input
                type="text"
                id="nazwisko"
                required
                placeholder="np. Kowalski"
                value={formData.nazwisko}
                onChange={(e) => setFormData({ ...formData, nazwisko: e.target.value })}
                className="app-input w-full"
              />
            </div>
            <div className="w-full">
              <label htmlFor="numer_telefonu" className="app-label">Telefon kontaktowy *</label>
              <input
                type="tel"
                id="numer_telefonu"
                required
                maxLength={15}
                placeholder="+48 500 600 700"
                value={formData.numer_telefonu}
                onChange={handlePhoneChange}
                onKeyDown={handlePhoneKeyDown}
                onFocus={(e) => {
                  if (!e.target.value || e.target.value.trim() === '+48') {
                    setFormData((prev) => ({ ...prev, numer_telefonu: '+48 ' }));
                  }
                }}
                className="app-input w-full"
              />
            </div>
            <div className="w-full">
              <label htmlFor="email" className="app-label">E-mail *</label>
              <input
                type="email"
                id="email"
                required
                placeholder="np. jan.kowalski@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="app-input w-full"
              />
            </div>
          </div>
        </section>

        {/* Część 2: Dane firmy */}
        <section className="mb-8">
          <div className="form-section-header">
            <span className="form-section-badge">2</span>
            <h3 className="form-section-title">Dane firmy</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="w-full md:col-span-2">
              <label htmlFor="nazwa_firmy" className="app-label">Nazwa firmy (opcjonalnie)</label>
              <input
                type="text"
                id="nazwa_firmy"
                placeholder="np. Kowalski Sp. z o.o."
                value={formData.nazwa_firmy}
                onChange={(e) => setFormData({ ...formData, nazwa_firmy: e.target.value })}
                className="app-input w-full"
              />
            </div>
            <div className="w-full md:col-span-2">
              <label htmlFor="adres" className="app-label">Adres *</label>
              <input
                type="text"
                id="adres"
                required
                placeholder="np. ul. Lipowa 12/4"
                value={formData.adres}
                onChange={(e) => setFormData({ ...formData, adres: e.target.value })}
                className="app-input w-full"
              />
            </div>
            <div className="w-full">
              <label htmlFor="kod_pocztowy" className="app-label">Kod pocztowy * (XX-XXX)</label>
              <input
                type="text"
                id="kod_pocztowy"
                required
                inputMode="numeric"
                maxLength={6}
                placeholder="00-000"
                value={formData.kod_pocztowy}
                onChange={handlePostalCodeChange}
                onKeyDown={handlePostalCodeKeyDown}
                className="app-input w-full"
              />
            </div>
            <div className="w-full">
              <label htmlFor="miasto" className="app-label">Miasto *</label>
              <input
                type="text"
                id="miasto"
                required
                placeholder="np. Warszawa"
                value={formData.miasto}
                onChange={(e) => setFormData({ ...formData, miasto: e.target.value })}
                className="app-input w-full"
              />
            </div>
            <div className="w-full md:col-span-2">
              <label htmlFor="nip" className="app-label">NIP * (10 cyfr, bez myślników)</label>
              <input
                type="text"
                id="nip"
                required
                inputMode="numeric"
                maxLength={10}
                placeholder="np. 1234567890"
                value={formData.nip}
                onChange={handleNipChange}
                className="app-input w-full"
              />
            </div>
            <div className="w-full md:col-span-2">
              <label htmlFor="telefon_kierunkowy" className="app-label">
                Telefon firmowy / stacjonarny *
              </label>
              <div className="flex flex-col md:flex-row gap-3">
                <div className="w-full md:w-1/3">
                  <select
                    id="telefon_kierunkowy"
                    value={formData.telefon_kierunkowy}
                    onChange={(e) => setFormData({ ...formData, telefon_kierunkowy: e.target.value })}
                    className="app-select cursor-pointer w-full"
                  >
                    <option value="">-- Kierunkowy (2 cyfry) --</option>
                    {NUMERY_KIERUNKOWE.map((item) => (
                      <option key={item.code} value={item.code}>
                        ({item.code}) {item.miasto}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-full md:w-2/3">
                  <input
                    type="text"
                    id="telefon_firmowy_7"
                    inputMode="numeric"
                    maxLength={7}
                    placeholder="Pozostałe 7 cyfr (np. 1234567)"
                    value={formData.telefon_firmowy_7}
                    onChange={handleCompanyPhone7Change}
                    className="app-input w-full"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Część 3: Zgłaszana usterka */}
        <section className="mb-8">
          <div className="form-section-header">
            <span className="form-section-badge">3</span>
            <h3 className="form-section-title">Zgłaszana usterka</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="w-full">
              <label htmlFor="data_zakupu" className="app-label">Data zakupu *</label>
              <input
                type="date"
                id="data_zakupu"
                required
                max={TODAY_ISO}
                value={formData.data_zakupu}
                onChange={(e) => setFormData({ ...formData, data_zakupu: e.target.value })}
                className="app-input w-full"
              />
            </div>
            <div className="w-full">
              <label htmlFor="numer_fv" className="app-label">Numer faktury / paragonu *</label>
              <input
                type="text"
                id="numer_fv"
                required
                placeholder="np. FV/2026/04/1234"
                value={formData.numer_fv}
                onChange={(e) => setFormData({ ...formData, numer_fv: e.target.value })}
                className="app-input w-full"
              />
            </div>
            <div className="w-full">
              <label htmlFor="przedmiot_zgloszenia" className="app-label">Przedmiot zgłoszenia *</label>
              <select
                id="przedmiot_zgloszenia"
                required
                value={formData.przedmiot_zgloszenia}
                onChange={handleSubjectChange}
                className="app-select cursor-pointer w-full"
              >
                <option value="">-- Wybierz przedmiot zgłoszenia --</option>
                {PRZEDMIOTY_LISTA.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-full">
              <label htmlFor="numer_seryjny" className="app-label">
                Numer seryjny (S/N){' '}
                {isSnActive ? (
                  <span className="text-danger font-semibold">* (wymagany)</span>
                ) : (
                  <span className="text-muted font-normal text-xs">(tylko dla monitorów i tablic)</span>
                )}
              </label>
              <input
                type="text"
                id="numer_seryjny"
                required={isSnActive}
                disabled={!isSnActive}
                placeholder={
                  isSnActive
                    ? 'np. SN123456789 (pole wymagane)'
                    : 'Dostępne tylko dla monitorów i tablic'
                }
                value={formData.numer_seryjny}
                onChange={(e) => setFormData({ ...formData, numer_seryjny: e.target.value })}
                className={`app-input w-full ${!isSnActive ? 'bg-page text-muted cursor-not-allowed border-line' : ''
                  }`}
              />
            </div>
            <div className="w-full md:col-span-2">
              <label htmlFor="opis_usterki" className="app-label">Dokładny opis usterki *</label>
              <textarea
                id="opis_usterki"
                required
                rows={4}
                placeholder="Opisz objawy, okoliczności powstania awarii oraz model urządzenia..."
                value={formData.opis_usterki}
                onChange={(e) => setFormData({ ...formData, opis_usterki: e.target.value })}
                className="app-textarea w-full"
              />
            </div>
          </div>
        </section>

        {/* Klauzula informacyjna z rozwijaną treścią i obowiązkowym checkboxem */}
        <section className="pt-6 border-t border-line mb-6">
          <details className="cursor-pointer mb-3 group">
            <summary className="font-semibold text-primary-dark text-sm select-none outline-none hover:underline">
              Informacja o przetwarzaniu danych osobowych (kliknij, aby rozwinąć)
            </summary>
            <div className="mt-2.5 p-3.5 bg-page rounded-lg text-xs text-ink leading-relaxed border border-line">
              <p>
                [Placeholder treści klauzuli.]
              </p>
            </div>
          </details>

          <div className="flex items-start gap-2.5 pt-1">
            <input
              type="checkbox"
              id="zgoda_rodo"
              name="zgoda_rodo"
              required
              checked={formData.zgoda_rodo}
              onChange={(e) => setFormData({ ...formData, zgoda_rodo: e.target.checked })}
              className="w-4 h-4 mt-0.5 rounded text-primary-dark border-line focus:ring-primary cursor-pointer accent-primary"
            />
            <label htmlFor="zgoda_rodo" className="cursor-pointer text-sm font-medium text-ink select-none">
              Zapoznałem/am się z informacją o przetwarzaniu danych osobowych *
            </label>
          </div>
        </section>

        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-6">
          <button type="submit" className="btn-primary w-full sm:w-auto" disabled={loading}>
            {loading ? 'Wysyłanie...' : 'Wyślij zgłoszenie'}
          </button>
          <button
            type="button"
            className="btn-secondary w-full sm:w-auto"
            onClick={handleReset}
            disabled={loading}
            title="Wyczyść wszystkie dane z formularza"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M3 6h18" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
            Wyczyść formularz
          </button>
        </div>
      </form>
    </main>
  );
}
