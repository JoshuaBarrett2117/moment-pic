import React, { useState } from 'react';
import { AlertCircle, ArrowRight, Camera, Info, Lock, PersonStanding } from 'lucide-react';
import { useAuth } from '../hooks';
import { WobblyButton } from './WobblyButton';

interface LoginScreenProps {
  onLogin: () => void;
  onAuthError?: (error: string) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, onAuthError }) => {
  const { login } = useAuth();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const didLogin = await login(username, password);
      if (didLogin) {
        onLogin();
        return;
      }

      const errorMsg = '用户名或密码错误';
      setError(errorMsg);
      onAuthError?.(errorMsg);
    } catch {
      const errorMsg = '网络错误，请稍后重试';
      setError(errorMsg);
      onAuthError?.(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-[100dvh] w-full items-center justify-center overflow-hidden px-4 py-10 sm:px-6">
      <section className="mp-glass-overlay relative z-10 flex w-full max-w-[440px] flex-col gap-8 rounded-[24px] p-7 sm:p-10">
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="mp-eyebrow">Moment · 瞬间图库</p>
          <div className="mt-1 flex items-center gap-3">
            <Camera className="h-7 w-7 text-primary" />
            <h1 className="mp-title text-[28px]">Moment Pic</h1>
          </div>
          <hr className="mp-rule my-2" />
          <p className="text-sm text-on-surface-variant">欢迎回来，进入你的瞬间图库</p>
        </div>

        {error && (
          <div role="alert" className="flex items-center gap-2 rounded-xl border border-error/30 bg-error-container p-4 text-on-error-container">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label htmlFor="login-username" className="ml-1 text-sm font-medium text-on-surface-variant">账号</label>
            <div className="mp-field flex items-center px-4 py-3">
              <PersonStanding className="mr-3 h-5 w-5 text-outline" />
              <input
                id="login-username"
                className="w-full border-none bg-transparent text-on-surface outline-none focus:ring-0"
                placeholder="请输入账号（默认 admin）"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="login-password" className="ml-1 text-sm font-medium text-on-surface-variant">密码</label>
            <div className="mp-field flex items-center px-4 py-3">
              <Lock className="mr-3 h-5 w-5 text-outline" />
              <input
                id="login-password"
                className="w-full border-none bg-transparent text-on-surface outline-none focus:ring-0"
                placeholder="请输入密码"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
              />
            </div>
          </div>

          <WobblyButton type="submit" className="mt-2 w-full" disabled={isLoading}>
            <span>{isLoading ? '登录中...' : '登录'}</span>
            <ArrowRight className="h-5 w-5" />
          </WobblyButton>
        </form>

        <div className="flex items-start gap-2 rounded-xl bg-surface-container px-4 py-3 text-xs leading-relaxed text-outline">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            当前版本仅支持账号密码登录。默认账号为 <code className="text-on-surface">admin</code>，密码以部署环境配置为准。登录后筛选与浏览状态会自动保留。
          </p>
        </div>

        <div className="text-center text-xs text-outline/70">Moment Pic · 为你的回忆而设计</div>
      </section>
    </div>
  );
};
