import React, { useState, useEffect, useCallback } from 'react';
import { userApi } from '../api';
import PasswordModal from './PasswordModal';
import { formatDateTime } from '../constants';

const ROLES = ['pracownik', 'serwisant', 'magazynier', 'admin'];

export default function AdminUsersPanel({ currentUser, showAlert, onWorkersChanged }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [passwordModalUser, setPasswordModalUser] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [actionInProgressId, setActionInProgressId] = useState(null);

  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('pracownik');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  const fetchUsers = useCallback(async () => {
    try {
      const data = await userApi.getUsers();
      if (Array.isArray(data)) setUsers(data);
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showAlert]);

  const handleClosePasswordModal = useCallback(() => setPasswordModalUser(null), []);

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- pobieranie danych: setState dopiero po await
    fetchUsers();
  }, [fetchUsers]);

  async function handleRoleChange(targetUser, nextRole) {
    if (targetUser.id === currentUser?.id && nextRole !== 'admin') {
      return showAlert('Nie możesz odebrać roli administratora samemu sobie!', 'error');
    }
    setActionInProgressId(targetUser.id);
    try {
      const data = await userApi.updateRole(targetUser.id, nextRole);
      if (!data) return;
      showAlert(data.message, 'success');
      setUsers((prev) => prev.map((u) => (u.id === targetUser.id ? { ...u, role: nextRole } : u)));
      onWorkersChanged?.();
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      setActionInProgressId(null);
    }
  }

  async function handleToggleStatus(targetUser) {
    if (targetUser.id === currentUser?.id && targetUser.aktywny) {
      return showAlert('Nie możesz zablokować własnego konta administratora!', 'error');
    }
    const confirmMsg = targetUser.aktywny
      ? `Czy na pewno chcesz zablokować konto "${targetUser.username}"? Użytkownik straci możliwość logowania.`
      : `Czy chcesz odblokować konto "${targetUser.username}"?`;
    if (!window.confirm(confirmMsg)) return;

    setActionInProgressId(targetUser.id);
    try {
      const data = await userApi.toggleStatus(targetUser.id, !targetUser.aktywny);
      if (!data) return;
      showAlert(data.message, 'success');
      setUsers((prev) => prev.map((u) => (u.id === targetUser.id ? { ...u, aktywny: data.aktywny } : u)));
      onWorkersChanged?.();
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      setActionInProgressId(null);
    }
  }

  async function handleCreateUser(e) {
    e.preventDefault();
    setCreateError(null);
    const cleanPass = newPassword;
    if (!newUsername.trim() || !newPassword.trim()) {
      return setCreateError('Wypełnij nazwę użytkownika oraz hasło.');
    }
    if (cleanPass.length < 8) {
      return setCreateError('Hasło musi mieć co najmniej 8 znaków.');
    }
    if (new TextEncoder().encode(cleanPass).length > 72) {
      return setCreateError('Hasło nie może przekraczać 72 znaków.');
    }
    setCreating(true);
    try {
      const data = await userApi.createUser({
        username: newUsername.trim(),
        password: cleanPass,
        role: newRole
      });
      if (!data) return;

      showAlert(`Użytkownik "${newUsername.trim()}" został utworzony.`, 'success');
      setNewUsername('');
      setNewPassword('');
      setNewRole('pracownik');
      setShowCreateForm(false);
      setLoading(true);
      fetchUsers();
      onWorkersChanged?.();
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  }

  const q = searchTerm.toLowerCase();
  const filteredUsers = users.filter(
    (u) => u.username.toLowerCase().includes(q) || u.role.toLowerCase().includes(q)
  );

  const stats = [
    { label: 'Wszystkie konta', value: users.length, color: 'text-primary-dark' },
    { label: 'Aktywne', value: users.filter((u) => u.aktywny).length, color: 'text-primary-dark' },
    { label: 'Zablokowane', value: users.filter((u) => !u.aktywny).length, color: 'text-danger' },
    {
      label: 'Administratorzy',
      value: users.filter((u) => u.role === 'admin').length,
      color: 'text-status-zakonczone'
    }
  ];

  const emptyText = searchTerm
    ? 'Nie znaleziono kont spełniających kryteria.'
    : 'Brak kont użytkowników w bazie.';

  const renderStatusPill = (aktywny) =>
    aktywny ? (
      <span className="inline-flex items-center gap-1 text-primary-dark bg-primary/10 border border-primary/30 px-2 py-0.5 rounded-full text-xs font-semibold">
        ● Aktywny
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 text-danger bg-danger/10 border border-danger/40 px-2 py-0.5 rounded-full text-xs font-semibold">
        ✕ Zablokowany
      </span>
    );

  // id podajemy, gdy pole ma widoczną etykietę (<label htmlFor>); w tabeli nazwę pola daje aria-label
  const renderRoleSelect = (u, isSelf, isBusy, fullWidth = false, id = undefined) => (
    <select
      id={id}
      aria-label={id ? undefined : `Rola użytkownika ${u.username}`}
      value={u.role}
      disabled={isBusy || (isSelf && u.role === 'admin')}
      onChange={(e) => handleRoleChange(u, e.target.value)}
      title={isSelf ? 'Nie możesz odebrać roli administratora samemu sobie' : 'Zmień rolę'}
      className={`bg-card border border-line rounded px-2.5 py-1.5 text-xs font-semibold text-ink outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60 cursor-pointer ${
        fullWidth ? 'w-full' : ''
      }`}
    >
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {r}
        </option>
      ))}
    </select>
  );

  const renderActionButtons = (u, isSelf, isBusy, mobile = false) => (
    <div className={`flex gap-2 flex-wrap items-center ${mobile ? 'w-full' : ''}`}>
      <button
        type="button"
        disabled={isBusy || isSelf}
        onClick={() => handleToggleStatus(u)}
        title={
          isSelf
            ? 'Nie możesz zablokować własnego konta'
            : u.aktywny
            ? 'Zablokuj konto'
            : 'Odblokuj konto'
        }
        className={`text-xs py-1.5 px-3 inline-flex items-center justify-center gap-1 ${
          mobile ? 'flex-1' : ''
        } ${u.aktywny ? 'btn-danger' : 'btn-primary'}`}
      >
        {u.aktywny ? 'Zablokuj' : 'Odblokuj'}
      </button>
      <button
        type="button"
        disabled={isBusy}
        onClick={() => setPasswordModalUser(u)}
        title="Ustaw nowe hasło dla tego konta"
        className={`btn-secondary text-xs py-1.5 px-3 inline-flex items-center justify-center gap-1 ${
          mobile ? 'flex-1' : ''
        }`}
      >
        Zmień hasło
      </button>
    </div>
  );

  return (
    <div>
      {/* Statystyki podsumowujące */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
        {stats.map((s) => (
          <div
            key={s.label}
            className="bg-card border border-primary/30 rounded-xl p-3 sm:p-4 flex flex-col shadow-sm"
          >
            <span className={`text-xl sm:text-2xl font-bold ${s.color}`}>{s.value}</span>
            <span className="text-xs text-muted font-medium mt-1">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Pasek narzędzi i przycisk tworzenia nowego konta */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 mb-5">
        <div className="flex gap-2 items-center flex-1 sm:max-w-sm">
          <input
            type="text"
            placeholder="Filtruj użytkowników..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="app-input py-2 text-sm w-full"
          />
        </div>
        <div className="flex gap-2 items-center">
          <button
            type="button"
            className="btn-secondary py-2 px-3 text-xs sm:text-sm flex-1 sm:flex-initial"
            onClick={() => {
              setLoading(true);
              fetchUsers();
            }}
            title="Odśwież listę kont"
          >
            Odśwież listę
          </button>
          <button
            type="button"
            className="btn-primary py-2 px-3 sm:px-4 text-xs sm:text-sm flex-1 sm:flex-initial"
            onClick={() => setShowCreateForm((prev) => !prev)}
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {showCreateForm ? 'Ukryj formularz' : 'Nowe konto'}
          </button>
        </div>
      </div>

      {/* Formularz tworzenia nowego użytkownika */}
      {showCreateForm && (
        <div className="form-section animate-[fadeIn_0.25s_ease-out]">
          <div className="form-section-header">
            <span className="form-section-badge">+</span>
            <h3 className="form-section-title">Dodaj nowe konto użytkownika</h3>
          </div>
          {createError && (
            <div className="p-3 mb-4 rounded-lg text-sm bg-danger/10 border border-danger/40 text-danger">
              {createError}
            </div>
          )}
          <form onSubmit={handleCreateUser}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label htmlFor="newUserUsername" className="app-label">Nazwa użytkownika (login) *</label>
                <input
                  id="newUserUsername"
                  type="text"
                  autoComplete="off"
                  required
                  maxLength={50}
                  placeholder="np. jankowalski"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="app-input"
                />
              </div>
              <div>
                <label htmlFor="newUserPassword" className="app-label">Hasło (min. 8 znaków) *</label>
                <input
                  id="newUserPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  maxLength={72}
                  placeholder="Wpisz hasło..."
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="app-input"
                />
              </div>
              <div>
                <label htmlFor="newUserRole" className="app-label">Rola *</label>
                <select
                  id="newUserRole"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="app-select cursor-pointer"
                >
                  <option value="pracownik">pracownik (przypisane zadania)</option>
                  <option value="serwisant">serwisant (przypisywanie i naprawa)</option>
                  <option value="magazynier">magazynier (wysyłka)</option>
                  <option value="admin">admin (pełny dostęp)</option>
                </select>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row justify-end gap-2.5 sm:gap-3 mt-4">
              <button
                type="button"
                className="btn-secondary w-full sm:w-auto"
                onClick={() => setShowCreateForm(false)}
              >
                Anuluj
              </button>
              <button type="submit" className="btn-primary w-full sm:w-auto" disabled={creating}>
                {creating ? 'Tworzenie konta...' : 'Utwórz konto'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Widok DESKTOP: Tabela użytkowników */}
      <div className="hidden md:block overflow-x-auto bg-card rounded-xl shadow-sm border border-line">
        <table>
          <thead>
            <tr>
              <th className="w-12 text-center">ID</th>
              <th className="min-w-[160px]">Użytkownik</th>
              <th className="min-w-[150px]">Rola</th>
              <th className="min-w-[120px]">Status</th>
              <th className="min-w-[150px]">Data utworzenia</th>
              <th className="min-w-[220px]">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-muted font-medium">
                  Ładowanie listy użytkowników...
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-muted font-medium">
                  {emptyText}
                </td>
              </tr>
            ) : (
              filteredUsers.map((u) => {
                const isSelf = u.id === currentUser?.id;
                const isBusy = actionInProgressId === u.id;
                return (
                  <tr
                    key={u.id}
                    className={u.aktywny ? 'hover:bg-page' : 'bg-danger/10 hover:bg-danger/15'}
                  >
                    <td className="text-center font-bold text-ink">#{u.id}</td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-ink">{u.username}</span>
                        {isSelf && (
                          <span
                            className="bg-primary-dark text-inverse text-[0.65rem] font-bold px-1.5 py-0.5 rounded-full uppercase"
                            title="Aktualnie zalogowany administrator"
                          >
                            Ty
                          </span>
                        )}
                      </div>
                    </td>
                    <td>{renderRoleSelect(u, isSelf, isBusy)}</td>
                    <td>{renderStatusPill(u.aktywny)}</td>
                    <td>
                      <small className="text-muted">
                        {formatDateTime(u.created_at)}
                      </small>
                    </td>
                    <td>{renderActionButtons(u, isSelf, isBusy)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Widok MOBILE: Karty użytkowników (bez przewijania w bok) */}
      <div className="block md:hidden space-y-3">
        {loading ? (
          <div className="bg-card rounded-xl border border-line p-6 text-center text-muted text-sm font-medium">
            Ładowanie listy użytkowników...
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="bg-card rounded-xl border border-line p-6 text-center text-muted text-sm font-medium">
            {emptyText}
          </div>
        ) : (
          filteredUsers.map((u) => {
            const isSelf = u.id === currentUser?.id;
            const isBusy = actionInProgressId === u.id;
            return (
              <div
                key={u.id}
                className={`rounded-xl border border-line p-4 shadow-xs space-y-3 ${
                  u.aktywny ? 'bg-card' : 'bg-danger/10'
                }`}
              >
                <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-line">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold text-muted">#{u.id}</span>
                      <span className="font-bold text-ink text-sm break-all">{u.username}</span>
                      {isSelf && (
                        <span className="bg-primary-dark text-inverse text-[0.65rem] font-bold px-1.5 py-0.5 rounded-full uppercase">
                          Ty
                        </span>
                      )}
                    </div>
                    <div className="text-[0.7rem] text-muted mt-0.5">
                      Utworzono: {formatDateTime(u.created_at)}
                    </div>
                  </div>
                  <div className="shrink-0">{renderStatusPill(u.aktywny)}</div>
                </div>

                <div>
                  <label
                    htmlFor={`userRole-${u.id}`}
                    className="text-[0.7rem] text-muted uppercase font-semibold block mb-1"
                  >
                    Rola użytkownika
                  </label>
                  {renderRoleSelect(u, isSelf, isBusy, true, `userRole-${u.id}`)}
                </div>

                <div className="pt-2 border-t border-line">
                  {renderActionButtons(u, isSelf, isBusy, true)}
                </div>
              </div>
            );
          })
        )}
      </div>

      {passwordModalUser && (
        <PasswordModal
          userToEdit={passwordModalUser}
          onClose={handleClosePasswordModal}
          onPasswordChanged={fetchUsers}
          showAlert={showAlert}
        />
      )}
    </div>
  );
}
