import { useEffect, useState, type FormEvent } from 'react';
import { KeyRound, UserRound } from 'lucide-react';

import { useCurrentUser } from '../app/current-user';
import { api } from '../lib/api';
import type { UserDTO } from '../types/api';
import { useToast } from './Toast';

const inputClass = 'w-full rounded-xl border border-outline/20 bg-surface-container-lowest px-4 py-3 text-on-surface outline-none focus:border-primary';

export function SettingsAccountPanel() {
  const { user, setUser } = useCurrentUser();
  const { toast } = useToast();
  const [username, setUsername] = useState(user?.username ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (user) setUsername(user.username);
  }, [user]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (newPassword && newPassword !== confirmPassword) {
      toast('两次输入的新密码不一致', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const updated = await api.patch<UserDTO>('/account', {
        currentPassword,
        username: username.trim(),
        ...(newPassword ? { newPassword } : {}),
      });
      setUser(updated);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast(newPassword ? '已保存，其他设备上的登录已失效' : '已保存', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : '保存失败', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <header className="mb-6 md:mb-12">
        <h2 className="text-2xl md:text-4xl font-headline font-bold text-on-surface">账号</h2>
        <p className="text-outline mt-2 text-sm md:text-base">
          修改登录用户名和密码。当前角色：{user?.role === 'viewer' ? '只读用户' : '管理员'}
        </p>
      </header>

      <form onSubmit={submit} className="bg-surface-container-highest rounded-2xl p-6 mb-8 max-w-xl space-y-5">
        <label className="block">
          <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-on-surface"><UserRound className="h-4 w-4" />用户名</span>
          <input className={inputClass} value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" maxLength={64} required />
        </label>
        <label className="block">
          <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-on-surface"><KeyRound className="h-4 w-4" />新密码（不改留空）</span>
          <input className={inputClass} type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" maxLength={128} />
        </label>
        {newPassword && (
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-on-surface">确认新密码</span>
            <input className={inputClass} type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" maxLength={128} required />
          </label>
        )}
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-on-surface">当前密码（必填）</span>
          <input className={inputClass} type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" maxLength={128} required />
        </label>
        <button type="submit" disabled={isSaving || !currentPassword} className="rounded-full bg-primary-container px-6 py-3 font-bold text-on-primary-container disabled:opacity-50">
          {isSaving ? '保存中…' : '保存'}
        </button>
      </form>
    </>
  );
}
