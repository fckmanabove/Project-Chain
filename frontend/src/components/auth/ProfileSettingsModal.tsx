import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { X, User as UserIcon, Lock, Trash2, AlertCircle, Eye, EyeOff, ShieldAlert, ShieldCheck, Mail, QrCode, Sun, Moon } from "lucide-react";
import { userApi } from "../../services/api";
import { User } from "../../types";

interface ProfileSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  onUserUpdated: (user: User) => void;
  onUserDeleted: () => void;
}

export const ProfileSettingsModal: React.FC<ProfileSettingsModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onUserUpdated,
  onUserDeleted,
}) => {
  if (!isOpen || !currentUser) return null;

  const [activeTab, setActiveTab] = useState<"PROFILE" | "2FA" | "EMAIL" | "DELETE">("PROFILE");
  const [fullName, setFullName] = useState(currentUser.full_name);
  const [userTheme, setUserTheme] = useState<"dark" | "light">((currentUser as any).theme || "dark");
  const [currentPassword, setCurrentPassword] = useState("");

  // Круговая анимация смены темы с синхронной отрисовкой всех кнопок
  const switchThemeWithRipple = (e: React.MouseEvent, targetTheme: "dark" | "light") => {
    if (userTheme === targetTheme) return;

    const doc = document as any;
    if (!doc.startViewTransition) {
      setUserTheme(targetTheme);
      document.documentElement.classList.remove("dark", "light");
      document.documentElement.classList.add(targetTheme);
      return;
    }

    const x = e.clientX;
    const y = e.clientY;
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );

    document.documentElement.classList.add("theme-transitioning");

    const transition = doc.startViewTransition(() => {
      ReactDOM.flushSync(() => {
        setUserTheme(targetTheme);
        document.documentElement.classList.remove("dark", "light");
        document.documentElement.classList.add(targetTheme);
      });
    });

    transition.ready.then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${endRadius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: 450,
          easing: "cubic-bezier(0.4, 0, 0.2, 1)",
          pseudoElement: "::view-transition-new(root)",
        }
      );
    });

    transition.finished.finally(() => {
      document.documentElement.classList.remove("theme-transitioning");
    });
  };
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);

  // 2FA Google Authenticator
  const [twoFactorMethod, setTwoFactorMethod] = useState<string>((currentUser as any).two_factor_method || "EMAIL_OTP");
  const [hasTotp, setHasTotp] = useState<boolean>(Boolean((currentUser as any).has_totp));

  // Подтягиваем свежие данные 2FA из PostgreSQL при открытии модалки
  useEffect(() => {
    if (isOpen) {
      userApi.getMe().then((fresh) => {
        setFullName(fresh.full_name);
        setUserTheme(fresh.theme || "dark");
        setTwoFactorMethod((fresh as any).two_factor_method || "EMAIL_OTP");
        setHasTotp(Boolean((fresh as any).has_totp));
      }).catch(() => {});
    }
  }, [isOpen]);
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [totpCodeInput, setTotpCodeInput] = useState("");
  const [disableTotpPass, setDisableTotpPass] = useState("");

  // Смена Email
  const [newEmail, setNewEmail] = useState("");
  const [emailOtpCode, setEmailOtpCode] = useState("");
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailDevOtp, setEmailDevOtp] = useState<string | null>(null);

  // Удаление аккаунта
  const [deleteOtpCode, setDeleteOtpCode] = useState("");
  const [deleteDevOtp, setDeleteDevOtp] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (newPassword && newPassword !== confirmNewPassword) {
      setError("Новые пароли не совпадают");
      return;
    }
    setLoading(true);
    try {
      await userApi.updateMe({
        full_name: fullName,
        current_password: currentPassword || undefined,
        new_password: newPassword || undefined,
        theme: userTheme,
      });
      const updated = {
        ...currentUser,
        full_name: fullName,
        theme: userTheme,
        two_factor_method: twoFactorMethod,
        has_totp: hasTotp,
      };
      onUserUpdated(updated);
      localStorage.setItem("prochain_user", JSON.stringify(updated));
      localStorage.setItem("prochain_theme", userTheme);
      document.documentElement.classList.remove("dark", "light");
      document.documentElement.classList.add(userTheme);
      setSuccess("Профиль и тема оформления успешно сохранены");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Ошибка сохранения профиля");
    } finally {
      setLoading(false);
    }
  };

  const handleStartTotpSetup = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await userApi.setupTotp();
      setTotpSecret(res.secret);
      setTotpUri(res.otpauth_uri);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Ошибка генерации 2FA ключа");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmTotp = async () => {
    if (!totpSecret || !totpCodeInput.trim()) return;
    setError(null);
    setLoading(true);
    try {
      await userApi.enableTotp(totpSecret, totpCodeInput.trim());
      setHasTotp(true);
      setTotpSecret(null);
      setTotpUri(null);
      setTwoFactorMethod("TOTP");
      const updated = { ...currentUser, two_factor_method: "TOTP", has_totp: true };
      onUserUpdated(updated);
      localStorage.setItem("prochain_user", JSON.stringify(updated));
      setSuccess("Google Authenticator успешно подключен!");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Неверный код из приложения");
    } finally {
      setLoading(false);
    }
  };

  const handleDisableTotp = async () => {
    if (!disableTotpPass) return;
    setError(null);
    setLoading(true);
    try {
      await userApi.disableTotp(disableTotpPass);
      setHasTotp(false);
      setTwoFactorMethod("EMAIL_OTP");
      setDisableTotpPass("");
      const updated = { ...currentUser, two_factor_method: "EMAIL_OTP", has_totp: false };
      onUserUpdated(updated);
      localStorage.setItem("prochain_user", JSON.stringify(updated));
      setSuccess("Google Authenticator отключен");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Неверный пароль");
    } finally {
      setLoading(false);
    }
  };

  const handleSavePolicy = async (method: string) => {
    setError(null);
    try {
      await userApi.set2faPolicy(method);
      setTwoFactorMethod(method);
      const updated = { ...currentUser, two_factor_method: method };
      onUserUpdated(updated);
      localStorage.setItem("prochain_user", JSON.stringify(updated));
      setSuccess("Политика 2FA обновлена");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Ошибка обновления 2FA политики");
    }
  };

  const handleRequestEmailChange = async () => {
    if (!newEmail.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const res = await userApi.changeEmailOtp(newEmail.trim());
      if (res.dev_otp) setEmailDevOtp(res.dev_otp);
      setEmailOtpSent(true);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Ошибка отправки кода на новый email");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmEmailChange = async () => {
    if (!newEmail.trim() || !emailOtpCode.trim()) return;
    setError(null);
    setLoading(true);
    try {
      await userApi.changeEmail(newEmail.trim(), emailOtpCode.trim());
      const updated = { ...currentUser, email: newEmail.trim() };
      onUserUpdated(updated);
      localStorage.setItem("prochain_user", JSON.stringify(updated));
      setSuccess("Email успешно изменен!");
      setEmailOtpSent(false);
      setNewEmail("");
      setEmailOtpCode("");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Неверный код подтверждения");
    } finally {
      setLoading(false);
    }
  };

  const handleRequestDeleteOtp = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await userApi.requestDeleteOtp();
      if (res.dev_otp) setDeleteDevOtp(res.dev_otp);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Ошибка запроса кода удаления");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteOtpCode.trim()) return;
    setError(null);
    setLoading(true);
    try {
      await userApi.deleteMe(deleteOtpCode.trim());
      onUserDeleted();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Неверный код подтверждения");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-850">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-cyan-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <UserIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">Личный кабинет сотрудника</h3>
              <p className="text-[11px] text-slate-400 font-mono">{currentUser.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Навигация разделов */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 p-1 text-xs">
          <button
            onClick={() => { setActiveTab("PROFILE"); setError(null); setSuccess(null); }}
            className={`flex-1 py-1.5 rounded-lg font-semibold transition-all ${activeTab === "PROFILE" ? "bg-slate-800 text-cyan-300 font-bold" : "text-slate-400"}`}
          >
            Профиль
          </button>
          <button
            onClick={() => { setActiveTab("2FA"); setError(null); setSuccess(null); }}
            className={`flex-1 py-1.5 rounded-lg font-semibold transition-all ${activeTab === "2FA" ? "bg-slate-800 text-cyan-300 font-bold" : "text-slate-400"}`}
          >
            2FA Защита
          </button>
          <button
            onClick={() => { setActiveTab("EMAIL"); setError(null); setSuccess(null); }}
            className={`flex-1 py-1.5 rounded-lg font-semibold transition-all ${activeTab === "EMAIL" ? "bg-slate-800 text-cyan-300 font-bold" : "text-slate-400"}`}
          >
            Смена Email
          </button>
          {currentUser.role_id !== "SUPERADMIN" && (
            <button
              onClick={() => { setActiveTab("DELETE"); setError(null); setSuccess(null); handleRequestDeleteOtp(); }}
              className={`flex-1 py-1.5 rounded-lg font-semibold transition-all ${activeTab === "DELETE" ? "bg-rose-950 text-rose-300 font-bold" : "text-slate-400"}`}
            >
              Удаление
            </button>
          )}
        </div>

        <div className="p-5 space-y-3.5 text-xs overflow-y-auto">
          {error && <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400">{error}</div>}
          {success && <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">{success}</div>}

          {/* Раздел 1: Профиль и пароль */}
          {activeTab === "PROFILE" && (
            <form onSubmit={handleSaveProfile} className="space-y-3.5">
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">ФИО</label>
                <input required type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-100" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-400 font-semibold">Должность</label>
                  <span className="text-[10px] text-slate-500 italic">Назначается администратором</span>
                </div>
                <input readOnly disabled value={currentUser.position || "Специалист"} className="w-full px-3 py-1.5 bg-slate-950/60 border border-slate-800 rounded-lg text-slate-400 cursor-not-allowed" />
              </div>

              {/* Выбор персональной цветовой палитры аккаунта */}
              <div className="p-3.5 rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-950/60 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Sun className="w-4 h-4 text-amber-500" />
                    <span>Персональная тема оформления</span>
                  </label>
                  <span className="text-[10px] font-mono text-slate-500">
                    {userTheme === "dark" ? "Активна: Тёмная" : "Активна: Светлая"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  {/* Карточка: Тёмная тема */}
                  <div
                    onClick={(e) => switchThemeWithRipple(e, "dark")}
                    className={`p-3 rounded-xl border-2 transition-all cursor-pointer flex items-center justify-between select-none ${
                      userTheme === "dark"
                        ? "border-cyan-500 bg-slate-900/90 shadow-md ring-2 ring-cyan-500/20"
                        : "border-slate-300 dark:border-slate-800 bg-white/60 dark:bg-slate-900/40 hover:border-slate-400"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* Изолированная плашка тёмного цвета */}
                      <div
                        style={{ backgroundColor: "#020617", borderColor: "#334155" }}
                        className="w-5 h-5 rounded-full border shadow-inner flex-shrink-0 flex items-center justify-center"
                      >
                        <Moon className="w-3 h-3 text-cyan-400" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-xs text-slate-900 dark:text-slate-100">Тёмная</div>
                        <div className="text-[10px] text-slate-500">Industrial Dark</div>
                      </div>
                    </div>
                    {/* Радио-кружок с синей точкой */}
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      userTheme === "dark" ? "border-cyan-500 bg-cyan-500/20" : "border-slate-400"
                    }`}>
                      {userTheme === "dark" && <div className="w-2 h-2 rounded-full bg-cyan-400" />}
                    </div>
                  </div>

                  {/* Карточка: Светлая тема */}
                  <div
                    onClick={(e) => switchThemeWithRipple(e, "light")}
                    className={`p-3 rounded-xl border-2 transition-all cursor-pointer flex items-center justify-between select-none ${
                      userTheme === "light"
                        ? "border-cyan-500 bg-cyan-50/80 dark:bg-slate-900 shadow-md ring-2 ring-cyan-500/20"
                        : "border-slate-300 dark:border-slate-800 bg-white/60 dark:bg-slate-900/40 hover:border-slate-400"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* Изолированная плашка светлого цвета */}
                      <div
                        style={{ backgroundColor: "#ffffff", borderColor: "#94a3b8" }}
                        className="w-5 h-5 rounded-full border shadow-sm flex-shrink-0 flex items-center justify-center"
                      >
                        <Sun className="w-3 h-3 text-amber-500" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-xs text-slate-900 dark:text-slate-100">Светлая</div>
                        <div className="text-[10px] text-slate-500">Excel Clean</div>
                      </div>
                    </div>
                    {/* Радио-кружок с синей точкой */}
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      userTheme === "light" ? "border-cyan-500 bg-cyan-500/20" : "border-slate-400"
                    }`}>
                      {userTheme === "light" && <div className="w-2 h-2 rounded-full bg-cyan-400" />}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 space-y-2.5">
                <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-cyan-400" /> Смена пароля
                </span>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Текущий пароль</label>
                  <div className="relative">
                    <input type={showCurrentPass ? "text" : "password"} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="••••••••••••" className="w-full px-2.5 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200 pr-8" />
                    <button type="button" onClick={() => setShowCurrentPass(!showCurrentPass)} className="absolute right-2 top-1.5 text-slate-400">
                      {showCurrentPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Новый пароль</label>
                  <div className="relative">
                    <input type={showNewPass ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••••••" className="w-full px-2.5 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200 pr-8" />
                    <button type="button" onClick={() => setShowNewPass(!showNewPass)} className="absolute right-2 top-1.5 text-slate-400">
                      {showNewPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Подтвердите пароль</label>
                  <input type="password" value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} placeholder="••••••••••••" className="w-full px-2.5 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200" />
                </div>
              </div>
              <div className="flex justify-end pt-1">
                <button type="submit" disabled={loading} className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg">
                  {loading ? "Сохранение..." : "Сохранить профиль"}
                </button>
              </div>
            </form>
          )}

          {/* Раздел 2: Google Authenticator (TOTP) и 2FA Политика */}
          {activeTab === "2FA" && (
            <div className="space-y-4">
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 space-y-2">
                <label className="block font-semibold text-slate-200">Политика двухфакторной аутентификации</label>
                <select
                  value={twoFactorMethod}
                  onChange={(e) => handleSavePolicy(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-cyan-300 font-semibold"
                >
                  <option value="EMAIL_OTP">Только Email OTP</option>
                  <option value="TOTP">Только Google Authenticator</option>
                  <option value="EMAIL_AND_TOTP">Email OTP + Google Authenticator</option>
                  <option value="DISABLED">Отключено (только пароль)</option>
                </select>
              </div>

              {!hasTotp ? (
                <div className="p-4 bg-slate-950/40 rounded-xl border border-slate-800 space-y-3">
                  <div className="flex items-center gap-2 text-cyan-400 font-bold">
                    <QrCode className="w-5 h-5" />
                    <span>Подключение Google Authenticator</span>
                  </div>
                  <p className="text-[11px] text-slate-400">Используйте Google Authenticator, Aegis, Authy или 1Password для генерации кодов.</p>

                  {!totpUri ? (
                    <button type="button" onClick={handleStartTotpSetup} disabled={loading} className="px-3.5 py-1.5 bg-cyan-600 text-white rounded-lg font-bold">
                      {loading ? "Генерация ключа..." : "Показать QR-код и ключ"}
                    </button>
                  ) : (
                    <div className="space-y-3 pt-2">
                      <div className="p-2 bg-white rounded-xl inline-block mx-auto">
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(totpUri)}`}
                          alt="QR Code"
                          className="w-40 h-40"
                        />
                      </div>
                      <div className="p-2 bg-slate-800 rounded font-mono text-[11px] text-cyan-300 select-all">
                        Ключ: {totpSecret}
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1 font-semibold">6-значный код из приложения</label>
                        <input
                          type="text"
                          maxLength={6}
                          value={totpCodeInput}
                          onChange={(e) => setTotpCodeInput(e.target.value.replace(/\D/g, ""))}
                          placeholder="000000"
                          className="w-full tracking-[0.5em] text-center font-mono font-bold text-lg px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-cyan-300"
                        />
                      </div>
                      <button type="button" onClick={handleConfirmTotp} disabled={loading || totpCodeInput.length !== 6} className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg disabled:opacity-50">
                        Активировать Authenticator
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 bg-emerald-950/20 border border-emerald-900/60 rounded-xl space-y-3">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold">
                    <ShieldCheck className="w-5 h-5" />
                    <span>Google Authenticator активен</span>
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Пароль для отключения Authenticator</label>
                    <input type="password" value={disableTotpPass} onChange={(e) => setDisableTotpPass(e.target.value)} placeholder="••••••••••••" className="w-full px-2.5 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200" />
                  </div>
                  <button type="button" onClick={handleDisableTotp} disabled={loading || !disableTotpPass} className="px-3 py-1.5 bg-rose-600/80 hover:bg-rose-600 text-white font-bold rounded-lg disabled:opacity-50">
                    Отключить Authenticator
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Раздел 3: Смена Email */}
          {activeTab === "EMAIL" && (
            <div className="space-y-3">
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                <span className="text-slate-400 block mb-0.5">Текущий адрес:</span>
                <span className="font-mono text-slate-200 font-bold">{currentUser.email}</span>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Новый рабочий Email</label>
                <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="new_email@prochain.ru" className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 font-mono" />
              </div>

              {!emailOtpSent ? (
                <button type="button" onClick={handleRequestEmailChange} disabled={loading || !newEmail.trim()} className="w-full py-2 bg-cyan-600 text-white font-bold rounded-lg disabled:opacity-50">
                  Отправить код на новый адрес
                </button>
              ) : (
                <div className="space-y-3 pt-2">
                  {emailDevOtp && (
                    <div className="p-1.5 bg-emerald-950/50 border border-emerald-800/80 rounded text-[11px] font-mono font-bold text-emerald-400 text-center">
                      Dev-код: {emailDevOtp}
                    </div>
                  )}
                  <div>
                    <label className="block text-slate-400 mb-1 font-semibold">Код подтверждения из письма</label>
                    <input type="text" maxLength={6} value={emailOtpCode} onChange={(e) => setEmailOtpCode(e.target.value.replace(/\D/g, ""))} placeholder="000000" className="w-full tracking-[0.5em] text-center font-mono font-bold text-lg px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-cyan-300" />
                  </div>
                  <button type="button" onClick={handleConfirmEmailChange} disabled={loading || emailOtpCode.length !== 6} className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg disabled:opacity-50">
                    Подтвердить и сменить Email
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Раздел 4: Удаление аккаунта по OTP */}
          {activeTab === "DELETE" && (
            <div className="space-y-3.5 p-4 bg-rose-950/20 border border-rose-900/60 rounded-xl text-center">
              <ShieldAlert className="w-7 h-7 text-rose-400 mx-auto" />
              <span className="text-sm font-bold text-rose-300 block">Удаление вашего аккаунта</span>
              <p className="text-[11px] text-slate-400">Код подтверждения отправлен на {currentUser.email}</p>

              {deleteDevOtp && (
                <div className="p-1.5 bg-emerald-950/50 border border-emerald-800/80 rounded text-[11px] font-mono font-bold text-emerald-400">
                  Dev-код: {deleteDevOtp}
                </div>
              )}

              <div>
                <input type="text" maxLength={6} autoFocus value={deleteOtpCode} onChange={(e) => setDeleteOtpCode(e.target.value.replace(/\D/g, ""))} placeholder="000000" className="w-full text-center tracking-[0.5em] font-mono font-bold text-lg px-3 py-2 bg-slate-950 border border-rose-900/60 rounded-lg text-rose-300" />
              </div>

              <button type="button" disabled={loading || deleteOtpCode.length !== 6} onClick={handleConfirmDelete} className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg disabled:opacity-50">
                {loading ? "Удаление..." : "Подтвердить безвозвратное удаление"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};