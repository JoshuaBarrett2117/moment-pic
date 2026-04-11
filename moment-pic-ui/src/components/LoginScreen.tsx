import React from 'react';
import { motion } from 'motion/react';
import { Camera, PersonStanding, Lock, Info, ArrowRight } from 'lucide-react';
import { WobblyButton } from './WobblyButton';
import { Polaroid } from './Polaroid';

interface LoginScreenProps {
  onLogin: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onLogin();
  };

  return (
    <div className="flex min-h-screen w-full">
      {/* Left Column: Login Area */}
      <section className="w-full max-w-[520px] bg-surface-container-low p-12 flex flex-col justify-between relative z-10">
        {/* Header Logo */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <Camera className="text-4xl text-on-primary-container w-10 h-10 fill-on-primary-container" />
            <h1 className="text-3xl font-black text-on-primary-container tracking-tighter font-headline">Moment Pic</h1>
          </div>
          <p className="text-sm font-medium text-outline pl-12 font-label">Local Gallery Manager</p>
        </div>

        {/* Main Form Content */}
        <div className="flex flex-col gap-8 relative">
          {/* Sticky Note Welcome */}
          <div className="sticky-note absolute -top-16 -right-4 px-6 py-3 rotate-6 z-20">
            <span className="text-on-primary-container font-bold text-lg font-body">欢迎回来</span>
          </div>

          <div className="bg-white/40 backdrop-blur-sm p-10 rounded-xl ambient-shadow border border-outline-variant/30">
            <div className="mb-10">
              <h2 className="text-4xl font-black text-on-primary-container font-headline mb-2">登录</h2>
              <p className="text-outline font-label">进入你的瞬间图库</p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              {/* Username Field */}
              <div className="flex flex-col gap-2">
                <label className="text-on-primary-container font-bold text-sm ml-4 font-label">账号</label>
                <div className="wobbly-border flex items-center px-6 py-3 bg-white/60">
                  <PersonStanding className="mr-3 text-outline w-5 h-5" />
                  <input 
                    className="bg-transparent border-none focus:ring-0 w-full placeholder:text-outline-variant text-on-primary-container outline-none" 
                    placeholder="请输入账号（默认 admin）" 
                    type="text" 
                  />
                </div>
              </div>

              {/* Password Field */}
              <div className="flex flex-col gap-2">
                <label className="text-on-primary-container font-bold text-sm ml-4 font-label">密码</label>
                <div className="wobbly-border flex items-center px-6 py-3 bg-white/60">
                  <Lock className="mr-3 text-outline w-5 h-5" />
                  <input 
                    className="bg-transparent border-none focus:ring-0 w-full placeholder:text-outline-variant text-on-primary-container outline-none" 
                    placeholder="请输入密码" 
                    type="password" 
                  />
                </div>
              </div>

              <div className="flex justify-between items-center px-2">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input className="w-5 h-5 rounded-md border-2 border-outline text-secondary focus:ring-secondary-container" type="checkbox" />
                  <span className="text-sm text-outline group-hover:text-on-primary-container transition-colors">记住我（24小时）</span>
                </label>
                <a className="text-sm text-outline hover:text-on-primary-container font-medium underline underline-offset-4 decoration-primary-fixed-dim" href="#">忘记密码？</a>
              </div>

              <WobblyButton type="submit" className="mt-4">
                <span>登录</span>
                <ArrowRight className="w-5 h-5" />
              </WobblyButton>
            </form>
          </div>

          <div className="flex items-center gap-3 px-4">
            <Info className="text-outline w-4 h-4" />
            <p className="text-xs text-outline font-medium">默认账号：admin，密码由部署环境配置</p>
          </div>
        </div>

        {/* Footer */}
        <div className="text-xs text-outline font-label text-center">
          © 2024 Moment Pic. Hand-crafted for your memories.
        </div>
      </section>

      {/* Right Column: Atmosphere Area */}
      <section className="flex-1 bg-background relative overflow-hidden flex items-center justify-center">
        {/* Decorative Doodles */}
        <div className="absolute inset-0 z-0 opacity-40">
          <div className="absolute top-10 left-10 text-6xl text-primary-fixed-dim">☁️</div>
          <div className="absolute bottom-20 right-20 text-6xl text-secondary-container">✨</div>
          <div className="absolute top-1/2 right-10 text-4xl text-tertiary-container -rotate-12">❤️</div>
        </div>

        {/* The Scrapbook Collage */}
        <div className="relative w-full h-full p-20 flex items-center justify-center">
          <Polaroid 
            src="https://picsum.photos/seed/home/400/400" 
            rotation={-6}
            className="absolute top-[15%] left-[20%] w-64"
          />
          <Polaroid 
            src="https://picsum.photos/seed/flowers/400/400" 
            rotation={12}
            className="absolute bottom-[20%] left-[15%] w-56"
          />
          <Polaroid 
            src="https://picsum.photos/seed/camera/400/400" 
            rotation={3}
            className="absolute top-[25%] right-[15%] w-72"
          />
          <Polaroid 
            src="https://picsum.photos/seed/lake/600/600" 
            rotation={-1}
            caption="The Best Moment"
            date="Captured 2024.08.15"
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 shadow-2xl z-30"
          />

          {/* Scrapbook Elements */}
          <div className="absolute bottom-10 right-32 z-40 bg-tertiary-fixed px-4 py-2 text-sm font-bold text-on-tertiary-container rounded-lg -rotate-12 wobbly-border">
            Collection #01
          </div>
        </div>
      </section>
    </div>
  );
};
