import React, { useState, useEffect } from "react";
import { Users, KeyRound, RefreshCw, Plus, Trash2, X, AlertCircle, ShieldAlert, Lock } from "lucide-react";
import { adminApi } from "../../services/api";
import { User, Role, SystemPermission } from "../../types";

const IOSToggle = ({ active, onToggle, disabled }: { active: boolean; onToggle: () => void; disabled?: boolean }) => (
  <div
    onClick={() => !disabled && onToggle()}
    className={`w-8 h-4.5 rounded-full p-0.5 transition-colors duration-200 ease-in-out cursor-pointer select-none flex-shrink-0 ${
      disabled ? "opacity-40 cursor-not-allowed" : ""
    } ${active ? "bg-cyan-500" : "bg-slate-700"}`}
  >
    <div
      className={`w-3.5 h-3.5 rounded-full bg-white shadow-md transform transition-transform duration-200 ease-in-out ${
        active ? "translate-x-3.5" : "translate-x-0"
      }`}
    />
  </div>
);

export const AdminConsole: React.FC = () => {
  const [tab, setTab] = useState<"USERS" | "ROLES">("USERS");
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [catalog, setCatalog] = useState<SystemPermission[]>([]);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  // Модалка создания пользователя
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserFullName, setNewUserFullName] = useState("");
  const [newUserPosition, setNewUserPosition] = useState("");
  const [newUserRole, setNewUserRole] = useState("PM");

  // Модалка создания роли
  const [isCreateRoleOpen, setIsCreateRoleOpen] = useState(false);
  const [newRoleId, setNewRoleId] = useState("");
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDesc, setNewRoleDesc] = useState("");

  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [u, r, c] = await Promise.all([adminApi.listUsers(), adminApi.listRoles(), adminApi.getPermissionsCatalog()]);
      setUsers(u);
      setRoles(r);
      setCatalog(c);
      if (r.length > 0 && !selectedRole) setSelectedRole(r[0]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleUserActive = async (u: User) => {
    const updated = !u.is_active;
    setUsers((prev) => prev.map((item) => (item.id === u.id ? { ...item, is_active: updated } : item)));
    await adminApi.updateUser(u.id, { is_active: updated });
  };

  const handleChangeUserRole = async (u: User, roleId: string) => {
    setUsers((prev) => prev.map((item) => (item.id === u.id ? { ...item, role_id: roleId } : item)));
    await adminApi.updateUser(u.id, { role_id: roleId });
  };

const handleAdminResetPassword = async (u: User) => {
    const newPass = window.prompt(`Введите новый пароль для сотрудника ${u.full_name} (${u.email}):`);
    if (!newPass || newPass.length < 6) {
      if (newPass) alert("Пароль должен содержать минимум 6 символов");
      return;
    }
    try {
      await adminApi.resetUserPassword(u.id, newPass);
      alert(`Пароль для ${u.email} успешно обновлен!`);
    } catch (err: any) {
      alert(err.response?.data?.detail || "Ошибка сброса пароля");
    }
  };

  const handleAdminResetTotp = async (u: User) => {
    if (!window.confirm(`Сбросить привязку Google Authenticator 2FA для ${u.full_name} (${u.email})?`)) return;
    try {
      await adminApi.resetUserTotp(u.id);
      alert(`2FA TOTP для ${u.email} успешно сброшен на Email OTP`);
      await loadData();
    } catch (err: any) {
      alert(err.response?.data?.detail || "Ошибка сброса 2FA");
    }
  };

  const handleDeleteUser = async (u: User) => {
    if (!window.confirm(`Удалить сотрудника ${u.full_name} (${u.email})? Действие можно отменить в Time Machine.`)) return;
    try {
      await adminApi.deleteUser(u.id);
      setUsers((prev) => prev.filter((item) => item.id !== u.id));
    } catch (err: any) {
      alert(err.response?.data?.detail || "Ошибка при удалении сотрудника");
    }
  };

  const handleCreateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await adminApi.createUser({
        email: newUserEmail,
        password: newUserPassword,
        full_name: newUserFullName,
        position: newUserPosition,
        role_id: newUserRole,
      });
      setIsCreateUserOpen(false);
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserFullName("");
      setNewUserPosition("");
      await loadData();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Ошибка создания сотрудника");
    }
  };

  const handleTogglePermission = async (permKey: string) => {
    if (!selectedRole || selectedRole.id === "SUPERADMIN") return;
    const hasPerm = selectedRole.permissions.includes(permKey);
    const newPerms = hasPerm
      ? selectedRole.permissions.filter((k) => k !== permKey)
      : [...selectedRole.permissions, permKey];

    setSelectedRole({ ...selectedRole, permissions: newPerms });
    setRoles((prev) => prev.map((r) => (r.id === selectedRole.id ? { ...r, permissions: newPerms } : r)));
    await adminApi.updateRole(selectedRole.id, { permissions: newPerms });
  };

  const handleCreateRoleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await adminApi.createRole({
        id: newRoleId.toUpperCase().trim(),
        name: newRoleName.trim(),
        description: newRoleDesc.trim(),
        permissions: ["projects:view", "tasks:view"],
      });
      setIsCreateRoleOpen(false);
      setNewRoleId("");
      setNewRoleName("");
      setNewRoleDesc("");
      await loadData();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Ошибка создания роли");
    }
  };

  const handleDeleteRole = async (r: Role) => {
    if (!window.confirm(`Удалить кастомную роль "${r.name}"? Пользователи этой роли будут переназначены на роль PM.`)) return;
    try {
      await adminApi.deleteRole(r.id);
      setSelectedRole(roles[0] || null);
      await loadData();
    } catch (err: any) {
      alert(err.response?.data?.detail || "Ошибка при удалении роли");
    }
  };

  if (loading) {
    return (
      <div className="h-64 flex flex-col items-center justify-center gap-3 text-slate-400">
        <RefreshCw className="w-8 h-8 animate-spin text-cyan-500" />
        <span className="text-xs">Загрузка данных администрирования...</span>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Навигация подвкладок */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-xl">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTab("USERS")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              tab === "USERS" ? "bg-cyan-600/20 text-cyan-300 border border-cyan-500/40" : "text-slate-400 hover:text-white"
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Сотрудники ({users.length})</span>
          </button>
          <button
            onClick={() => setTab("ROLES")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              tab === "ROLES" ? "bg-cyan-600/20 text-cyan-300 border border-cyan-500/40" : "text-slate-400 hover:text-white"
            }`}
          >
            <KeyRound className="w-4 h-4" />
            <span>Матрица прав (RBAC)</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {tab === "USERS" ? (
            <button
              onClick={() => { setError(null); setIsCreateUserOpen(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Добавить сотрудника</span>
            </button>
          ) : (
            <button
              onClick={() => { setError(null); setIsCreateRoleOpen(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Создать роль</span>
            </button>
          )}
          <button onClick={loadData} className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Таблица пользователей */}
      {tab === "USERS" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-850 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
              <tr>
                <th className="p-3">Сотрудник / Email</th>
                <th className="p-3">Должность</th>
                <th className="p-3">Роль в системе</th>
                <th className="p-3 text-center">2FA статус</th>
                <th className="p-3 text-center">Доступ (iOS)</th>
                <th className="p-3 text-center w-16">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 font-sans">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="p-3">
                    <div className="font-semibold text-slate-100">{u.full_name}</div>
                    <div className="font-mono text-[11px] text-cyan-400">{u.email}</div>
                  </td>
                  <td className="p-3 text-slate-300">{u.position || "—"}</td>
                  <td className="p-3">
                    <select
                      value={u.role_id}
                      disabled={u.role_id === "SUPERADMIN"}
                      onChange={(e) => handleChangeUserRole(u, e.target.value)}
                      className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200 text-xs font-semibold disabled:opacity-50"
                    >
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-3 text-center">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        u.is_verified ? "bg-emerald-950 text-emerald-300 border border-emerald-800" : "bg-amber-950 text-amber-300 border border-amber-800"
                      }`}
                    >
                      {u.is_verified ? "✓ 2FA OK" : "Ожидает OTP"}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <IOSToggle
                        active={u.is_active}
                        disabled={u.role_id === "SUPERADMIN"}
                        onToggle={() => handleToggleUserActive(u)}
                      />
                      <span className={`text-[10px] font-mono ${u.is_active ? "text-emerald-400" : "text-rose-400 font-bold"}`}>
                        {u.is_active ? "Доступ" : "Блок"}
                      </span>
                    </div>
                  </td>
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => handleAdminResetPassword(u)}
                        className="p-1 text-slate-400 hover:text-cyan-300 transition-colors"
                        title="Сбросить пароль сотруднику"
                      >
                        <Lock className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleAdminResetTotp(u)}
                        className="p-1 text-slate-400 hover:text-amber-400 transition-colors"
                        title="Сбросить 2FA Google Authenticator"
                      >
                        <ShieldAlert className="w-3.5 h-3.5" />
                      </button>
                      {u.role_id !== "SUPERADMIN" && (
                        <button
                          onClick={() => handleDeleteUser(u)}
                          className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                          title="Удалить сотрудника (с фиксацией в Time Machine)"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Матрица прав ролей */}
      {tab === "ROLES" && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-1.5 shadow-xl">
            <span className="text-[11px] text-slate-400 font-semibold uppercase px-2 block mb-2">Выберите роль:</span>
            {roles.map((r) => (
              <div
                key={r.id}
                onClick={() => setSelectedRole(r)}
                className={`w-full px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all flex items-center justify-between group ${
                  selectedRole?.id === r.id ? "bg-cyan-600 text-white shadow-md" : "text-slate-300 hover:bg-slate-800"
                }`}
              >
                <div>
                  <div>{r.name}</div>
                  <div className="font-mono text-[10px] opacity-75">{r.id}</div>
                </div>
                {!r.is_system && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleDeleteRole(r); }}
                    className="p-1 text-slate-400 hover:text-rose-300 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Удалить кастомную роль"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="md:col-span-3 bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl space-y-4">
            <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <span>Права роли:</span>
                  <span className="text-cyan-400">{selectedRole?.name}</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">{selectedRole?.description || "Кастомная роль"}</p>
              </div>
              {selectedRole?.id === "SUPERADMIN" ? (
                <span className="px-2.5 py-1 rounded bg-purple-950 text-purple-300 border border-purple-800 text-[10px] font-bold">
                  Полный доступ [*]
                </span>
              ) : selectedRole?.is_system ? (
                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] font-mono">Системная роль</span>
              ) : (
                <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 text-[10px] font-mono">Кастомная роль</span>
              )}
            </div>

            <div className="divide-y divide-slate-800">
              {catalog.map((perm) => {
                const isChecked = selectedRole?.id === "SUPERADMIN" || (selectedRole?.permissions.includes(perm.key) ?? false);
                return (
                  <div key={perm.key} className="py-2.5 flex items-center justify-between gap-4">
                    <div>
                      <div className="font-semibold text-slate-200 text-xs">{perm.name}</div>
                      <div className="font-mono text-[10px] text-slate-500">{perm.key} • {perm.category}</div>
                    </div>
                    <IOSToggle
                      active={isChecked}
                      disabled={selectedRole?.id === "SUPERADMIN"}
                      onToggle={() => handleTogglePermission(perm.key)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Модалка создания сотрудника */}
      {isCreateUserOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-100">Добавление нового сотрудника</h3>
              <button onClick={() => setIsCreateUserOpen(false)} className="p-1 text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            {error && <div className="p-2 bg-rose-500/10 text-rose-400 rounded border border-rose-500/30">{error}</div>}
            <form onSubmit={handleCreateUserSubmit} className="space-y-3">
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">ФИО</label>
                <input required type="text" value={newUserFullName} onChange={(e) => setNewUserFullName(e.target.value)} placeholder="Петров Иван Васильевич" className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-100" />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Должность</label>
                <input type="text" value={newUserPosition} onChange={(e) => setNewUserPosition(e.target.value)} placeholder="Инженер ПТО" className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-100" />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Рабочий Email</label>
                <input required type="email" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} placeholder="pto@prochain.ru" className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-100 font-mono" />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Временный пароль</label>
                <input required type="password" value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} placeholder="••••••••••••" className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-100 font-mono" />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Роль в системе</label>
                <select value={newUserRole} onChange={(e) => setNewUserRole(e.target.value)} className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-200 font-medium">
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button type="button" onClick={() => setIsCreateUserOpen(false)} className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded">Отмена</button>
                <button type="submit" className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded font-bold">Создать</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Модалка создания роли */}
      {isCreateRoleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-100">Создание новой роли</h3>
              <button onClick={() => setIsCreateRoleOpen(false)} className="p-1 text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            {error && <div className="p-2 bg-rose-500/10 text-rose-400 rounded border border-rose-500/30">{error}</div>}
            <form onSubmit={handleCreateRoleSubmit} className="space-y-3">
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Код роли (Uppercase)</label>
                <input required type="text" value={newRoleId} onChange={(e) => setNewRoleId(e.target.value)} placeholder="LOGIST" className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-cyan-300 font-mono font-bold" />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Название роли</label>
                <input required type="text" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} placeholder="Специалист по логистике" className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-100" />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Описание</label>
                <textarea rows={2} value={newRoleDesc} onChange={(e) => setNewRoleDesc(e.target.value)} placeholder="Контроль графиков поставок и разгрузки..." className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-100" />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button type="button" onClick={() => setIsCreateRoleOpen(false)} className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded">Отмена</button>
                <button type="submit" className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded font-bold">Создать роль</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};