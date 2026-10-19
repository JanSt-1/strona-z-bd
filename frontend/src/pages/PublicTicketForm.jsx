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

function Field({ id, label, span2 = false, ...inputProps }) {
  return (
    <div className={`w-full ${span2 ? 'md:col-span-2' : ''}`}>
      <label htmlFor={id} className="app-label">
        {label}
      </label>
      <input id={id} className="app-input w-full" {...inputProps} />
    </div>
  );
}

export default function PublicTicketForm() {
  const [formData, setFormData] = useState(EMPTY_TICKET_FORM);
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState(null);
  const [submittedTicket, setSubmittedTicket] = useState(() => {
    try {
      const stored = sessionStorage.getItem('serwis_last_submitted');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const setField = (key) => (e) =>
    setFormData((prev) => ({ ...prev, [key]: e.target.value }));

  function showAlert(message, type = 'success') {
    setAlert({ message, type });
    setTimeout(() => setAlert(null), 6000);
  }

  function handleNewSubmission() {
    try {
      sessionStorage.removeItem('serwis_last_submitted');
    } catch {}
    setSubmittedTicket(null);
    setFormData({ ...EMPTY_TICKET_FORM, numer_telefonu: '+48 ' });
    setAlert(null);
  }

  function handlePhoneChange(e) {
    let digits = e.target.value.replace(/\D/g, '');
    if (digits.startsWith('48')) digits = digits.slice(2);
    digits = digits.slice(0, 9);
    const formatted =
      '+48 ' +
      [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6)].filter(Boolean).join(' ');
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

  function handleSubjectChange(e) {
    const val = e.target.value;
    setFormData((prev) => ({
      ...prev,
      przedmiot_zgloszenia: val,
      numer_seryjny: isSerialNumberAllowed(val) ? prev.numer_seryjny : ''
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const cleanDigits = formData.numer_telefonu.replace(/\D/g, '').replace(/^48/, '');
    const dateErr = validatePurchaseDate(formData.data_zakupu);
    const hasLandlineInput = Boolean(formData.telefon_kierunkowy || formData.telefon_firmowy_7);

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
      [Boolean(dateErr), dateErr],
      [!formData.numer_fv.trim(), 'Pole "Numer faktury / paragonu" jest wymagane.'],
      [!/^\d{10}$/.test(formData.nip.trim()), 'Pole "NIP" jest wymagane i musi składać się z dokładnie 10 cyfr (bez myślników).'],
      [hasLandlineInput && !formData.telefon_kierunkowy, 'Proszę wybrać 2-cyfrowy numer kierunkowy dla telefonu stacjonarnego.'],
      [hasLandlineInput && formData.telefon_firmowy_7.length < 7, 'Dla telefonu stacjonarnego należy podać pełne 7 cyfr po numerze kierunkowym.'],
      [!formData.zgoda_rodo, 'Wymagane jest potwierdzenie zapoznania się z informacją o przetwarzaniu danych osobowych.']
    ].find(([invalid]) => invalid);

    if (validationError) {
      return showAlert(validationError[1], 'error');
    }

    setLoading(true);
    try {
      const stacjonarnyFormatted =
        formData.telefon_kierunkowy && formData.telefon_firmowy_7.length === 7
          ? `+48${formData.telefon_kierunkowy}${formData.telefon_firmowy_7}`
          : null;

      const payload = {
        website: formData.website || '',
        imie: formData.imie,
        nazwisko: formData.nazwisko,
        nazwa_firmy: formData.nazwa_firmy ? formData.nazwa_firmy.trim() : null,
        numer_telefonu: formData.numer_telefonu.replace(/\s+/g, ''),
        telefon_stacjonarny: stacjonarnyFormatted,
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
      const ticketInfo = {
        id: data.id,
        imie: payload.imie,
        nazwisko: payload.nazwisko,
        email: payload.email,
        numer_telefonu: formData.numer_telefonu,
        telefon_stacjonarny: stacjonarnyFormatted,
        przedmiot_zgloszenia: payload.przedmiot_zgloszenia,
        createdAt: new Date().toLocaleString('pl-PL')
      };
      try {
        sessionStorage.setItem('serwis_last_submitted', JSON.stringify(ticketInfo));
      } catch {}
      setSubmittedTicket(ticketInfo);
      setFormData({ ...EMPTY_TICKET_FORM, numer_telefonu: '+48 ' });
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  const isSnActive = isSerialNumberAllowed(formData.przedmiot_zgloszenia);

  if (submittedTicket) {
    const summaryItems = [
      ['Klient:', `${submittedTicket.imie} ${submittedTicket.nazwisko}`],
      ['Przedmiot serwisu:', submittedTicket.przedmiot_zgloszenia],
      ['Adres e-mail:', submittedTicket.email],
      ['Telefon komórkowy:', submittedTicket.numer_telefonu],
      ...(submittedTicket.telefon_stacjonarny
        ? [['Telefon stacjonarny:', submittedTicket.telefon_stacjonarny]]
        : []),
      ...(submittedTicket.createdAt
        ? [['Data złożenia:', submittedTicket.createdAt, true]]
        : [])
    ];

    return (
      <main className="app-card max-w-2xl mx-auto my-4 sm:my-8 p-6 sm:p-10 space-y-6">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary-dark mx-auto shadow-sm">
            <svg className="w-9 h-9" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-ink">
            Zgłoszenie nr {submittedTicket.id} przyjęte
          </h2>
          <p className="text-sm sm:text-base text-muted max-w-md mx-auto">
            Dziękujemy! Twoje zgłoszenie serwisowe zostało pomyślnie zarejestrowane w naszym systemie.
          </p>
        </div>

        <section className="form-section space-y-4" aria-label="Informacje o kolejnych krokach">
          <div className="flex items-center gap-2 border-b border-line pb-3">
            <span className="font-semibold text-lg text-ink">Co dalej?</span>
          </div>

          <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 text-sm text-ink space-y-1">
            <p className="font-semibold text-primary-dark">⏱️ Czas reakcji serwisu:</p>
            <p>
              Skontaktujemy się w ciągu{' '}
              <strong className="font-bold underline decoration-primary">[X] dni roboczych</strong>{' '}
              (zazwyczaj do 2 dni roboczych) pod wskazanym adresem e-mail lub numerem telefonu.
            </p>
          </div>

          <ol className="space-y-3 text-sm text-ink list-decimal list-inside pl-1">
            <li>
              <strong>Weryfikacja zgłoszenia:</strong> Serwisant zapozna się ze zgłoszonym problemem dotyczącym sprzętu: <em>{submittedTicket.przedmiot_zgloszenia}</em>.
            </li>
            <li>
              <strong>Kontakt i decyzja:</strong> Skontaktujemy się w ciągu [X] dni roboczych, aby potwierdzić przyjęcie sprzętu lub uzgodnić sposób wysyłki/odbioru.
            </li>
            <li>
              <strong>Bieżący monitoring:</strong> Zachowaj numer zgłoszenia <strong>#{submittedTicket.id}</strong> do ewentualnego kontaktu z obsługą serwisu.
            </li>
          </ol>
        </section>

        <section className="form-section space-y-3 text-sm" aria-label="Podsumowanie zgłoszenia">
          <div className="flex items-center justify-between border-b border-line pb-2">
            <span className="font-semibold text-ink">Podsumowanie zgłoszenia</span>
            <span className="text-xs text-muted">ID: #{submittedTicket.id}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-ink">
            {summaryItems.map(([label, val, fullSpan]) => (
              <div key={label} className={fullSpan ? 'sm:col-span-2' : ''}>
                <span className="text-muted block text-xs">{label}</span>
                <span className="font-medium">{val}</span>
              </div>
            ))}
          </div>
        </section>

        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={handleNewSubmission}
            className="btn-primary"
            title="Wypełnij nowe zgłoszenie serwisowe"
          >
            ➕ Złóż kolejne zgłoszenie
          </button>
        </div>
      </main>
    );
  }

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
            onChange={setField('website')}
          />
        </div>

        {/* Część 1: Dane osoby zgłaszającej */}
        <section className="mb-8">
          <div className="form-section-header">
            <span className="form-section-badge">1</span>
            <h3 className="form-section-title">Dane osoby zgłaszającej</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field
              id="imie"
              label="Imię *"
              type="text"
              required
              placeholder="np. Jan"
              value={formData.imie}
              onChange={setField('imie')}
            />
            <Field
              id="nazwisko"
              label="Nazwisko *"
              type="text"
              required
              placeholder="np. Kowalski"
              value={formData.nazwisko}
              onChange={setField('nazwisko')}
            />
            <Field
              id="numer_telefonu"
              label="Telefon kontaktowy *"
              type="tel"
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
            />
            <Field
              id="email"
              label="E-mail *"
              type="email"
              required
              placeholder="np. jan.kowalski@example.com"
              value={formData.email}
              onChange={setField('email')}
            />
          </div>
        </section>

        {/* Część 2: Dane firmy */}
        <section className="mb-8">
          <div className="form-section-header">
            <span className="form-section-badge">2</span>
            <h3 className="form-section-title">Dane firmy</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field
              id="nazwa_firmy"
              label="Nazwa firmy (opcjonalnie)"
              span2
              type="text"
              placeholder="np. Kowalski Sp. z o.o."
              value={formData.nazwa_firmy}
              onChange={setField('nazwa_firmy')}
            />
            <Field
              id="adres"
              label="Adres *"
              span2
              type="text"
              required
              placeholder="np. ul. Lipowa 12/4"
              value={formData.adres}
              onChange={setField('adres')}
            />
            <Field
              id="kod_pocztowy"
              label="Kod pocztowy * (XX-XXX)"
              type="text"
              required
              inputMode="numeric"
              maxLength={6}
              placeholder="00-000"
              value={formData.kod_pocztowy}
              onChange={handlePostalCodeChange}
              onKeyDown={handlePostalCodeKeyDown}
            />
            <Field
              id="miasto"
              label="Miasto *"
              type="text"
              required
              placeholder="np. Warszawa"
              value={formData.miasto}
              onChange={setField('miasto')}
            />
            <Field
              id="nip"
              label="NIP * (10 cyfr, bez myślników)"
              span2
              type="text"
              required
              inputMode="numeric"
              maxLength={10}
              placeholder="np. 1234567890"
              value={formData.nip}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  nip: e.target.value.replace(/\D/g, '').slice(0, 10)
                }))
              }
            />
            <div className="w-full md:col-span-2">
              <label htmlFor="telefon_kierunkowy" className="app-label flex items-center justify-between">
                <span>Telefon stacjonarny</span>
                <span className="font-normal text-muted text-xs">opcjonalnie</span>
              </label>
              <div className="flex flex-col md:flex-row gap-3">
                <div className="w-full md:w-1/3">
                  <select
                    id="telefon_kierunkowy"
                    value={formData.telefon_kierunkowy}
                    onChange={setField('telefon_kierunkowy')}
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
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        telefon_firmowy_7: e.target.value.replace(/\D/g, '').slice(0, 7)
                      }))
                    }
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
            <Field
              id="data_zakupu"
              label="Data zakupu *"
              type="date"
              required
              max={TODAY_ISO}
              value={formData.data_zakupu}
              onChange={setField('data_zakupu')}
            />
            <Field
              id="numer_fv"
              label="Numer faktury / paragonu *"
              type="text"
              required
              placeholder="np. FV/2026/04/1234"
              value={formData.numer_fv}
              onChange={setField('numer_fv')}
            />
            <div className="w-full">
              <label htmlFor="przedmiot_zgloszenia" className="app-label">
                Przedmiot zgłoszenia *
              </label>
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
                onChange={setField('numer_seryjny')}
                className={`app-input w-full ${
                  !isSnActive ? 'bg-page text-muted cursor-not-allowed border-line' : ''
                }`}
              />
            </div>
            <div className="w-full md:col-span-2">
              <label htmlFor="opis_usterki" className="app-label">
                Dokładny opis usterki *
              </label>
              <textarea
                id="opis_usterki"
                required
                rows={4}
                placeholder="Opisz objawy, okoliczności powstania awarii oraz model urządzenia..."
                value={formData.opis_usterki}
                onChange={setField('opis_usterki')}
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
              <p>[Placeholder treści klauzuli.]</p>
            </div>
          </details>

          <div className="flex items-start gap-2.5 pt-1">
            <input
              type="checkbox"
              id="zgoda_rodo"
              name="zgoda_rodo"
              required
              checked={formData.zgoda_rodo}
              onChange={(e) => setFormData((prev) => ({ ...prev, zgoda_rodo: e.target.checked }))}
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
            onClick={() => {
              setFormData(EMPTY_TICKET_FORM);
              setAlert(null);
            }}
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
