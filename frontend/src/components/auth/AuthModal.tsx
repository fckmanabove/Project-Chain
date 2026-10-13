import React, { useState, useEffect } from "react";
import { X, ShieldCheck, AlertCircle, Eye, EyeOff, RotateCcw, KeyRound, Zap } from "lucide-react";
import { authApi } from "../../services/api";
import { User } from "../../types";

interface AuthModalProps {
  isOpen: boolean;
  isMandatory?: boolean;
  onClose: () => void;
  onSuccess: (user: User) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  isMandatory = false,
  onClose,
  onSuccess,
}) => {
  if (!isOpen) return null;

  const [mode, setMode] = useState<"LOGIN" | "LOGIN_PASSWORD" | "REGISTER" | "OTP" | "FORGOT_EMAIL" | "FORGOT_OTP" | "LOGIN_2FA">("LOGIN");
  const [twoFactorType, setTwoFactorType] = useState<"TOTP" | "EMAIL_OTP">("EMAIL_OTP");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [fullName, setFullName] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(60);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if ((mode !== "OTP" && mode !== "FORGOT_OTP") || countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [mode, countdown]);

  const resetState = () => {
    setMode("LOGIN");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setFullName("");
    setOtpCode("");
    setDevOtp(null);
    setError(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if ((mode === "REGISTER" || mode === "FORGOT_OTP") && password !== confirmPassword) {
      setError("Пароли не совпадают");
      return;
    }

    setLoading(true);
    try {
      if (mode === "LOGIN") {
        const init = await authApi.loginInit(email);
        if (init.auth_method === "TOTP") {
          setTwoFactorType("TOTP");
          setOtpCode("");
          setMode("LOGIN_2FA");
          return;
        }
        if (init.auth_method === "EMAIL_OTP") {
          setTwoFactorType("EMAIL_OTP");
          setOtpCode("");
          setMode("LOGIN_2FA");
          return;
        }
        // Пароль требуется только если 2FA отключена
        setMode("LOGIN_PASSWORD");
        return;
      } else if (mode === "LOGIN_PASSWORD") {
        const res = await authApi.login(email, password);
        onSuccess(res.user);
        handleClose();
      } else if (mode === "LOGIN_2FA") {
        const res = await authApi.verifyLogin2FA(email, otpCode);
        onSuccess(res.user);
        handleClose();
      } else if (mode === "REGISTER") {
        const res = await authApi.register({ email, password, full_name: fullName });
        if (res.dev_otp) setDevOtp(res.dev_otp);
        setCountdown(60);
        setMode("OTP");
      } else if (mode === "OTP") {
        const res = await authApi.verifyOtp(email, otpCode);
        onSuccess(res.user);
        handleClose();
      } else if (mode === "FORGOT_EMAIL") {
        const res = await authApi.forgotPassword(email);
        if (res.dev_otp) setDevOtp(res.dev_otp);
        setCountdown(60);
        setMode("FORGOT_OTP");
      } else if (mode === "FORGOT_OTP") {
        const res = await authApi.resetPassword({ email, code: otpCode, new_password: password });
        onSuccess(res.user);
        handleClose();
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || "Ошибка авторизации");
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authApi.login("admin@prochain.ru", "AdminSecret2026!");
      if (res.user) {
        onSuccess(res.user);
        handleClose();
      } else {
        setError("Не удалось выполнить демо-вход");
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || "Ошибка подключения к демо-серверу");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    try {
      if (mode === "FORGOT_OTP") {
        const res = await authApi.forgotPassword(email);
        if (res.dev_otp) setDevOtp(res.dev_otp);
      } else {
        const res = await authApi.resendOtp(email);
        if (res.dev_otp) setDevOtp(res.dev_otp);
      }
      setCountdown(60);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Ошибка отправки кода");
    }
  };

  const modalTitle =
    mode === "LOGIN"
      ? "Вход в ProChain"
      : mode === "LOGIN_PASSWORD"
      ? "Вход по паролю"
      : mode === "LOGIN_2FA"
      ? twoFactorType === "TOTP" ? "Google Authenticator" : "2FA Подтверждение"
      : mode === "REGISTER"
      ? "Регистрация"
      : mode === "OTP"
      ? "2FA Верификация"
      : "Сброс пароля";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-850">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-cyan-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              {mode.startsWith("FORGOT") ? <KeyRound className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">{modalTitle}</h3>
              <p className="text-[11px] text-slate-400">
                {mode === "OTP" || mode === "FORGOT_OTP"
                  ? "Введите 6-значный код подтверждения"
                  : mode === "FORGOT_EMAIL"
                  ? "Восстановление доступа через OTP"
                  : "Промышленный контур безопасности"}
              </p>
            </div>
          </div>
          {!isMandatory && (
            <button onClick={handleClose} className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3.5 text-xs">
          {/* Кнопка быстрого демо-входа для рекрутеров и техлидов */}
          <button
            type="button"
            onClick={handleDemoLogin}
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500/20 via-cyan-500/20 to-amber-500/20 hover:from-amber-500/30 hover:to-cyan-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition-all shadow-md shadow-amber-950/40 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Zap className="w-4 h-4 text-amber-400 animate-pulse" />
            <span>⚡ Демо-вход в 1 клик (SuperAdmin / Все права)</span>
          </button>
          {error && (
            <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {mode === "LOGIN_2FA" ? (
            <div className="space-y-3">
              <div className="text-center p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                <span className="text-slate-400 block mb-1">
                  {twoFactorType === "TOTP"
                    ? "Откройте приложение Google Authenticator / 1Password:"
                    : "Одноразовый код выслан на почту:"}
                </span>
                <span className="font-mono text-cyan-400 font-bold">{email}</span>
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">6-значный код безопасности</label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  autoFocus
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className="w-full text-center tracking-[0.5em] text-lg font-mono font-bold px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-cyan-300 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div className="flex justify-end pt-1 text-[11px]">
                <button type="button" onClick={() => setMode("LOGIN")} className="text-slate-400 hover:text-white">
                  ← Назад к вводу пароля
                </button>
              </div>
            </div>
          ) : mode === "OTP" ? (
            <div className="space-y-3">
              <div className="text-center p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                <span className="text-slate-400 block mb-1">Код подтверждения отправлен на почту:</span>
                <span className="font-mono text-cyan-400 font-bold">{email}</span>
                {devOtp && (
                  <div className="mt-2 text-[11px] text-emerald-400 bg-emerald-950/50 p-1.5 rounded border border-emerald-800/80 font-mono font-bold">
                    Dev-код: {devOtp}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">6-значный OTP код</label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  autoFocus
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className="w-full text-center tracking-[0.5em] text-lg font-mono font-bold px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-cyan-300 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div className="flex items-center justify-between pt-1 text-[11px]">
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={countdown > 0}
                  className="text-cyan-400 hover:underline disabled:text-slate-500 disabled:no-underline flex items-center gap-1 font-medium"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>{countdown > 0 ? `Отправить повторно (${countdown}с)` : "Отправить код повторно"}</span>
                </button>
                <button type="button" onClick={() => setMode("REGISTER")} className="text-slate-400 hover:text-white">
                  Изменить email
                </button>
              </div>
            </div>
          ) : mode === "FORGOT_EMAIL" ? (
            <div className="space-y-3">
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Введите ваш рабочий Email</label>
                <input
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="engineer@prochain.ru"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 font-mono"
                />
              </div>
            </div>
          ) : mode === "FORGOT_OTP" ? (
            <div className="space-y-3">
              <div className="text-center p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                <span className="text-slate-400 block mb-1">Код сброса отправлен на:</span>
                <span className="font-mono text-cyan-400 font-bold">{email}</span>
                {devOtp && (
                  <div className="mt-2 text-[11px] text-emerald-400 bg-emerald-950/50 p-1.5 rounded border border-emerald-800/80 font-mono font-bold">
                    Dev-код: {devOtp}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">6-значный OTP код</label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  autoFocus
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className="w-full text-center tracking-[0.5em] text-lg font-mono font-bold px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-cyan-300 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Новый пароль</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 font-mono pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-2.5 text-slate-400"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Подтвердите новый пароль</label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 font-mono pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-2.5 top-2.5 text-slate-400"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {mode === "REGISTER" && (
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">ФИО</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Иванов Алексей Петрович"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100"
                  />
                </div>
              )}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-400 font-semibold">Рабочий Email</label>
                  {mode === "LOGIN_PASSWORD" && (
                    <button
                      type="button"
                      onClick={() => setMode("LOGIN")}
                      className="text-[10px] text-cyan-400 hover:underline"
                    >
                      ← Изменить email
                    </button>
                  )}
                </div>
                <input
                  type="email"
                  required
                  disabled={mode === "LOGIN_PASSWORD"}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="engineer@prochain.ru"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 font-mono disabled:opacity-60"
                />
              </div>

              {/* Пароль запрашивается ТОЛЬКО при регистрации либо если у аккаунта отключена 2FA */}
              {(mode === "REGISTER" || mode === "LOGIN_PASSWORD") && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-slate-400 font-semibold">Пароль</label>
                    {mode === "LOGIN_PASSWORD" && (
                      <button
                        type="button"
                        onClick={() => { setMode("FORGOT_EMAIL"); setError(null); }}
                        className="text-[10px] text-cyan-400 hover:underline"
                      >
                        Забыли пароль?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      autoFocus={mode === "LOGIN_PASSWORD"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 font-mono tracking-wider pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-200"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              {mode === "REGISTER" && (
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Подтвердите пароль</label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 font-mono tracking-wider pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-200"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-bold shadow-lg shadow-cyan-950 transition-colors disabled:opacity-50 mt-2"
          >
            {loading
              ? "Обработка..."
              : mode === "LOGIN"
              ? "Продолжить"
              : mode === "LOGIN_PASSWORD"
              ? "Войти по паролю"
              : mode === "REGISTER"
              ? "Отправить код подтверждения"
              : mode === "FORGOT_EMAIL"
              ? "Получить код для сброса"
              : mode === "FORGOT_OTP"
              ? "Сбросить пароль и войти"
              : "Подтвердить вход"}
          </button>

          <div className="pt-2 border-t border-slate-800 flex justify-between text-[11px]">
            {mode === "LOGIN" ? (
              <button type="button" onClick={() => { setMode("REGISTER"); setError(null); }} className="text-cyan-400 hover:underline">
                Регистрация
              </button>
            ) : (
              <button type="button" onClick={() => { setMode("LOGIN"); setError(null); }} className="text-cyan-400 hover:underline">
                Уже есть аккаунт? Войти
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};