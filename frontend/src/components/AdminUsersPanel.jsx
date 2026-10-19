import React, { useState, useEffect, useCallback } from 'react';
import { userApi } from '../api';
import AdminPasswordModal from './AdminPasswordModal';

export default function AdminUsersPanel({ currentUser, showAlert }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [passwordModalUser, setPasswordModalUser] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [actionInProgressId, setActionInProgressId] = useState(null);

  // Formularz nowego konta
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('pracownik');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  const fetchUsers = useCallback(async (opts = {}) => {
    if (opts.showLoading) {
      setLoading(true);
    }
    try {
      const data = await userApi.getUsers();
      if (Array.isArray(data)) {
        setUsers(data);
      }
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showAlert]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  async function handleRoleChange(targetUser, nextRole) {
    if (targetUser.id === currentUser?.id && nextRole !== 'admin') {
      showAlert('Nie możesz odebrać roli administratora samemu sobie!', 'error');
      return;
    }
    setActionInProgressId(targetUser.id);
    try {
      const data = await userApi.updateRole(targetUser.id, nextRole);
      if (!data) return;

      showAlert(data.message, 'success');
      setUsers((prev) =>
        prev.map((u) => (u.id === targetUser.id ? { ...u, role: nextRole } : u))
      );
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      setActionInProgressId(null);
    }
  }

  async function handleToggleStatus(targetUser) {
    if (targetUser.id === currentUser?.id && targetUser.aktywny) {
      showAlert('Nie możesz zablokować własnego konta administratora!', 'error');
      return;
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
      setUsers((prev) =>
        prev.map((u) => (u.id === targetUser.id ? { ...u, aktywny: data.aktywny } : u))
      );
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      setActionInProgressId(null);
    }
  }

  async function handleCreateUser(e) {
    e.preventDefault();
    setCreateError(null);
    if (!newUsername.trim() || !newPassword) {
      setCreateError('Wypełnij nazwę użytkownika oraz hasło.');
      return;
    }
    if (newPassword.length < 8) {
      setCreateError('Hasło musi mieć co najmniej 8 znaków.');
      return;
    }
    setCreating(true);
    try {
      const data = await userApi.createUser({
        username: newUsername.trim(),
        password: newPassword,
        role: newRole
      });
      if (!data) return;

      showAlert(`Użytkownik "${newUsername.trim()}" został utworzony.`, 'success');
      setNewUsername('');
      setNewPassword('');
      setNewRole('pracownik');
      setShowCreateForm(false);
      fetchUsers({ showLoading: true });
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  }

  const filteredUsers = users.filter((u) => {
    const q = searchTerm.toLowerCase();
    return u.username.toLowerCase().includes(q) || u.role.toLowerCase().includes(q);
  });

  const totalCount = users.length;
  const activeCount = users.filter((u) => u.aktywny).length;
  const blockedCount = users.filter((u) => !u.aktywny).length;
  const adminCount = users.filter((u) => u.role === 'admin').length;

  return (
    <div>
      {/* Statystyki podsumowujące */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-card border border-primary/30 rounded-xl p-4 flex flex-col shadow-sm">
          <span className="text-2xl font-bold text-primary-dark">{totalCount}</span>
          <span className="text-xs text-muted font-medium mt-1">Wszystkie konta</span>
        </div>
        <div className="bg-card border border-primary/30 rounded-xl p-4 flex flex-col shadow-sm">
          <span className="text-2xl font-bold text-primary-dark">{activeCount}</span>
          <span className="text-xs text-muted font-medium mt-1">Aktywne</span>
        </div>
        <div className="bg-card border border-primary/30 rounded-xl p-4 flex flex-col shadow-sm">
          <span className="text-2xl font-bold text-danger">{blockedCount}</span>
          <span className="text-xs text-muted font-medium mt-1">Zablokowane</span>
        </div>
        <div className="bg-card border border-primary/30 rounded-xl p-4 flex flex-col shadow-sm">
          <span className="text-2xl font-bold text-status-zakonczone">{adminCount}</span>
          <span className="text-xs text-muted font-medium mt-1">Administratorzy</span>
        </div>
      </div>

      {/* Pasek narzędzi i przycisk tworzenia nowego konta */}
      <div className="flex justify-between items-center flex-wrap gap-3 mb-5">
        <div className="flex gap-2 items-center flex-1 max-w-sm">
          <input
            type="text"
            placeholder="Filtruj użytkowników..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="app-input py-2 text-sm"
          />
        </div>
        <div className="flex gap-2 items-center">
          <button
            type="button"
            className="btn-secondary py-2 px-3 text-sm"
            onClick={fetchUsers}
            title="Odśwież listę kont"
          >
            Odśwież listę
          </button>
          <button
            type="button"
            className="btn-primary py-2 px-4 text-sm"
            onClick={() => setShowCreateForm((prev) => !prev)}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
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
                <label className="app-label">Nazwa użytkownika (login) *</label>
                <input
                  type="text"
                  required
                  maxLength={50}
                  placeholder="np. jankowalski"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="app-input"
                />
              </div>
              <div>
                <label className="app-label">Hasło (min. 8 znaków) *</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  placeholder="Wpisz hasło..."
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="app-input"
                />
              </div>
              <div>
                <label className="app-label">Rola *</label>
                <select
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
            <div className="flex justify-end gap-3 mt-4">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowCreateForm(false)}
              >
                Anuluj
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={creating}
              >
                {creating ? 'Tworzenie konta...' : 'Utwórz konto'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tabela użytkowników */}
      <div className="overflow-x-auto bg-card rounded-xl shadow-sm border border-line">
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
                  {searchTerm ? 'Nie znaleziono kont spełniających kryteria.' : 'Brak kont użytkowników w bazie.'}
                </td>
              </tr>
            ) : (
              filteredUsers.map((u) => {
                const isSelf = u.id === currentUser?.id;
                const isBusy = actionInProgressId === u.id;
                return (
                  <tr key={u.id} className={u.aktywny ? 'hover:bg-page' : 'bg-danger/10 hover:bg-danger/15'}>
                    <td className="text-center font-bold text-ink">#{u.id}</td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-ink">{u.username}</span>
                        {isSelf && (
                          <span className="bg-primary-dark text-inverse text-[0.65rem] font-bold px-1.5 py-0.5 rounded-full uppercase" title="Aktualnie zalogowany administrator">
                            Ty
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <select
                        value={u.role}
                        disabled={isBusy || (isSelf && u.role === 'admin')}
                        onChange={(e) => handleRoleChange(u, e.target.value)}
                        title={isSelf ? 'Nie możesz odebrać roli administratora samemu sobie' : 'Zmień rolę'}
                        className="bg-card border border-line rounded px-2 py-1 text-xs font-semibold text-ink outline-none focus:border-primary/30 disabled:opacity-60 cursor-pointer"
                      >
                        <option value="pracownik">pracownik</option>
                        <option value="serwisant">serwisant</option>
                        <option value="magazynier">magazynier</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                    <td>
                      {u.aktywny ? (
                        <span className="inline-flex items-center gap-1 text-primary-dark bg-primary/10 border border-primary/30 px-2 py-0.5 rounded-full text-xs font-semibold">
                          ● Aktywny
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-danger bg-danger/10 border border-danger/40 px-2 py-0.5 rounded-full text-xs font-semibold">
                          ✕ Zablokowany
                        </span>
                      )}
                    </td>
                    <td>
                      <small className="text-muted">
                        {u.created_at ? new Date(u.created_at).toLocaleString('pl-PL') : '-'}
                      </small>
                    </td>
                    <td>
                      <div className="flex gap-1.5 flex-wrap items-center">
                        <button
                          type="button"
                          disabled={isBusy || isSelf}
                          onClick={() => handleToggleStatus(u)}
                          title={isSelf ? 'Nie możesz zablokować własnego konta' : (u.aktywny ? 'Zablokuj konto' : 'Odblokuj konto')}
                          className={`text-xs py-1 px-2.5 inline-flex items-center gap-1 ${
                            u.aktywny ? 'btn-danger' : 'btn-primary'
                          }`}
                        >
                          {u.aktywny ? 'Zablokuj' : 'Odblokuj'}
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setPasswordModalUser(u)}
                          title="Ustaw nowe hasło dla tego konta"
                          className="btn-secondary text-xs py-1 px-2.5 inline-flex items-center gap-1"
                        >
                          Zmień hasło
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {passwordModalUser && (
        <AdminPasswordModal
          userToEdit={passwordModalUser}
          onClose={() => setPasswordModalUser(null)}
          onPasswordChanged={fetchUsers}
          showAlert={showAlert}
        />
      )}
    </div>
  );
}
