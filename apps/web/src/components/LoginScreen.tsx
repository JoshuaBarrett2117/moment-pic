import React, { useState } from 'react';
import { AlertCircle, ArrowRight, Camera, Info, Lock, PersonStanding } from 'lucide-react';
import { useAuth, useWideMobile } from '../hooks';
import { Polaroid } from './Polaroid';
import { WobblyButton } from './WobblyButton';

interface LoginScreenProps {
  onLogin: () => void;
  onAuthError?: (error: string) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, onAuthError }) => {
  const isWideMobile = useWideMobile();
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
    <div className={`flex min-h-screen w-full flex-col ${isWideMobile ? '' : 'md:flex-row'}`}>
      <section
        className={`relative z-10 flex min-h-screen w-full flex-col justify-between bg-surface-container-low ${
          isWideMobile ? 'mx-auto w-full max-w-[980px] px-6 py-8 sm:px-10' : 'p-6 sm:p-8 md:min-h-0 md:max-w-[520px] md:p-12'
        }`}
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <Camera className="h-10 w-10 fill-on-primary-container text-on-primary-container" />
            <h1 className="font-headline text-3xl font-black tracking-tighter text-on-primary-container">Moment Pic</h1>
          </div>
          <p className="pl-12 font-label text-sm font-medium text-outline">本地瞬间图库</p>
        </div>

        <div className={`relative flex flex-col ${isWideMobile ? 'mt-8 gap-6' : 'mt-16 gap-8 md:mt-0'}`}>
          <div className={`sticky-note absolute z-20 rotate-6 px-6 py-3 ${isWideMobile ? '-right-1 -top-10' : '-top-16 md:-right-4'}`}>
            <span className="font-body text-lg font-bold text-on-primary-container">欢迎回来</span>
          </div>

          <div className="ambient-shadow rounded-xl border border-outline-variant/30 bg-white/40 p-8 backdrop-blur-sm sm:p-10">
            {error && (
              <div className="mb-6 flex items-center gap-2 rounded-lg bg-error-container p-4 text-on-error-container">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            <div className={`mb-10 ${isWideMobile ? 'mb-8' : ''}`}>
              <h2 className={`mb-2 font-headline font-black text-on-primary-container ${isWideMobile ? 'text-3xl' : 'text-4xl'}`}>登录</h2>
              <p className="font-label text-outline">进入你的瞬间图库</p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <label className="ml-4 font-label text-sm font-bold text-on-primary-container">账号</label>
                <div className="wobbly-border flex items-center bg-white/60 px-6 py-3">
                  <PersonStanding className="mr-3 h-5 w-5 text-outline" />
                  <input
                    className="w-full border-none bg-transparent text-on-primary-container outline-none placeholder:text-outline-variant focus:ring-0"
                    placeholder="请输入账号（默认 admin）"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="ml-4 font-label text-sm font-bold text-on-primary-container">密码</label>
                <div className="wobbly-border flex items-center bg-white/60 px-6 py-3">
                  <Lock className="mr-3 h-5 w-5 text-outline" />
                  <input
                    className="w-full border-none bg-transparent text-on-primary-container outline-none placeholder:text-outline-variant focus:ring-0"
                    placeholder="请输入密码"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="rounded-2xl bg-surface-container-high px-4 py-3 text-sm leading-relaxed text-outline">
                当前版本仅支持账号密码登录。
                <br />
                默认账号为 <code>admin</code>，密码请以部署环境配置为准。
              </div>

              <WobblyButton type="submit" className="mt-4" disabled={isLoading}>
                <span>{isLoading ? '登录中...' : '登录'}</span>
                <ArrowRight className="h-5 w-5" />
              </WobblyButton>
            </form>
          </div>

          <div className="flex items-center gap-3 px-4">
            <Info className="h-4 w-4 text-outline" />
            <p className="text-xs font-medium text-outline">登录后会直接进入图库首页，筛选与浏览状态会自动保留。</p>
          </div>
        </div>

        <div className="mt-12 text-center font-label text-xs text-outline md:mt-0">© 2024 Moment Pic · 为你的回忆而设计</div>
      </section>

      <section className={isWideMobile ? 'hidden' : 'relative hidden flex-1 items-center justify-center overflow-hidden bg-background md:flex'}>
        <div className="absolute inset-0 z-0 opacity-40">
          <div className="absolute left-10 top-10 text-6xl text-primary-fixed-dim">✦</div>
          <div className="absolute bottom-20 right-20 text-6xl text-secondary-container">✦</div>
          <div className="absolute right-10 top-1/2 -rotate-12 text-4xl text-tertiary-container">✦</div>
        </div>

        <div className="relative flex h-full w-full items-center justify-center p-20">
          <Polaroid src="https://picsum.photos/seed/home/400/400" rotation={-6} className="absolute left-[20%] top-[15%] w-64" />
          <Polaroid src="https://picsum.photos/seed/flowers/400/400" rotation={12} className="absolute bottom-[20%] left-[15%] w-56" />
          <Polaroid src="https://picsum.photos/seed/camera/400/400" rotation={3} className="absolute right-[15%] top-[25%] w-72" />
          <Polaroid
            src="https://picsum.photos/seed/lake/600/600"
            rotation={-1}
            caption="The Best Moment"
            date="Captured 2024.08.15"
            className="absolute left-1/2 top-1/2 z-30 w-80 -translate-x-1/2 -translate-y-1/2 shadow-2xl"
          />

          <div className="wobbly-border absolute bottom-10 right-32 z-40 -rotate-12 rounded-lg bg-tertiary-fixed px-4 py-2 text-sm font-bold text-on-tertiary-container">
            Collection #01
          </div>
        </div>
      </section>
    </div>
  );
};
