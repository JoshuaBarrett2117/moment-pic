import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ShieldCheck, Trash2, UserPlus } from 'lucide-react';

import { useCurrentUser } from '../app/current-user';
import { api } from '../lib/api';
import type { UserDTO, UserRoleDTO } from '../types/api';
import { useToast } from './Toast';

const inputClass = 'w-full rounded-xl border border-outline/20 bg-surface-container-high px-4 py-2.5 text-on-surface outline-none focus:border-primary';
const roleLabel: Record<UserRoleDTO, string> = { admin: '管理员', viewer: '只读' };

export function SettingsUsersPanel() {
  const { user: me } = useCurrentUser();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserDTO[]>([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRoleDTO>('viewer');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setUsers((await api.get<{ items: UserDTO[] }>('/users')).items);
    } catch (error) {
      toast(error instanceof Error ? error.message : '获取用户失败', 'error');
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await action();
      toast(success, 'success');
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : '操作失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  const create = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await api.post('/users', { username: username.trim(), password, role });
      setUsername('');
      setPassword('');
    }, '已添加用户');
  };

  const resetPassword = (target: UserDTO) => {
    const next = prompt(`为「${target.username}」设置新密码`);
    if (next) void run(() => api.patch(`/users/${target.id}`, { password: next }), '密码已重置，该用户需重新登录');
  };

  return (
    <>
      <header className="mb-6 md:mb-12">
        <h2 className="text-2xl md:text-4xl font-headline font-black text-on-surface">用户管理</h2>
        <p className="text-outline mt-2 text-sm md:text-base">管理员可以管理图库和设置；只读用户只能浏览图集，阅读进度各自独立。</p>
      </header>

      <form onSubmit={create} className="bg-surface-container-highest rounded-2xl p-6 mb-8 grid gap-4 md:grid-cols-[1fr_1fr_auto_auto] md:items-end">
        <label className="block">
          <span className="mb-2 block text-sm font-semibold">用户名</span>
          <input className={inputClass} value={username} onChange={(event) => setUsername(event.target.value)} maxLength={64} required />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold">初始密码</span>
          <input className={inputClass} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" maxLength={128} required />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold">角色</span>
          <select className={inputClass} value={role} onChange={(event) => setRole(event.target.value as UserRoleDTO)}>
            <option value="viewer">只读</option>
            <option value="admin">管理员</option>
          </select>
        </label>
        <button type="submit" disabled={busy} className="flex items-center justify-center gap-2 rounded-full bg-primary-container px-5 py-2.5 font-bold text-on-primary-container disabled:opacity-50">
          <UserPlus className="h-4 w-4" />添加
        </button>
      </form>

      <div className="bg-surface-container-highest rounded-2xl divide-y divide-outline/10">
        {users.map((item) => {
          const isMe = item.id === me?.id;
          return (
            <div key={item.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-on-surface truncate">
                  {item.username}{isMe && <span className="ml-2 text-xs text-outline">（我）</span>}
                </p>
                <p className="text-sm text-outline">
                  {item.role === 'admin' && <ShieldCheck className="mr-1 inline h-4 w-4" />}
                  {roleLabel[item.role]}{item.disabled && ' · 已禁用'}
                </p>
              </div>
              {!isMe && (
                <div className="flex flex-wrap gap-2">
                  <select
                    className="rounded-full border border-outline/20 bg-surface-container-high px-3 py-1.5 text-sm"
                    value={item.role}
                    disabled={busy}
                    onChange={(event) => void run(() => api.patch(`/users/${item.id}`, { role: event.target.value }), '角色已更新')}
                  >
                    <option value="viewer">只读</option>
                    <option value="admin">管理员</option>
                  </select>
                  <button type="button" disabled={busy} onClick={() => resetPassword(item)} className="rounded-full border border-outline/20 px-3 py-1.5 text-sm">重置密码</button>
                  <button type="button" disabled={busy} onClick={() => void run(() => api.patch(`/users/${item.id}`, { disabled: !item.disabled }), item.disabled ? '已启用' : '已禁用')} className="rounded-full border border-outline/20 px-3 py-1.5 text-sm">
                    {item.disabled ? '启用' : '禁用'}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => { if (confirm(`确定删除用户「${item.username}」吗？`)) void run(() => api.delete(`/users/${item.id}`), '已删除'); }}
                    className="flex items-center gap-1 rounded-full border border-error/30 px-3 py-1.5 text-sm text-error"
                  >
                    <Trash2 className="h-4 w-4" />删除
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
