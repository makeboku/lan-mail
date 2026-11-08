import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Container from '../components/Container';
import { API_BASE_URL } from '../config';
import type { AnnouncementData, AnnouncementLevel } from '../utils/api';

const LEVEL_OPTIONS: Array<{ value: AnnouncementLevel; label: string }> = [
  { value: 'info', label: '普通通知（蓝色）' },
  { value: 'success', label: '好消息（绿色）' },
  { value: 'warning', label: '提醒（黄色）' },
  { value: 'important', label: '重要（红色）' }
];

const LEVEL_PREVIEW: Record<string, string> = {
  info: 'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200',
  success: 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200',
  warning: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200',
  important: 'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200'
};

const SECRET_HINT = '与 /admin/migrate 使用同一个 MIGRATION_SECRET；密钥只保存在当前页面内存中，不会写入 localStorage。';

const pad = (value: number): string => String(value).padStart(2, '0');

// 秒级时间戳 -> datetime-local 输入框字符串
const toLocalInput = (seconds: number): string => {
  if (!seconds) return '';
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

// datetime-local 输入框字符串 -> 秒级时间戳
const fromLocalInput = (value: string): number => {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : Math.floor(time / 1000);
};

const formatTimestamp = (seconds: number): string => {
  if (!seconds) return '不限';
  return new Date(seconds * 1000).toLocaleString();
};

const parseJson = async (response: Response): Promise<any> => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text.slice(0, 200) };
  }
};

class AnnouncementApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AnnouncementApiError';
    this.status = status;
  }
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof AnnouncementApiError && error.status === 401) {
    return 'MIGRATION_SECRET 不正确，或服务端没有配置 MIGRATION_SECRET。';
  }
  if (error instanceof Error) return error.message;
  return String(error);
};

const AdminNoticePage: React.FC = () => {
  const [secret, setSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [contentEn, setContentEn] = useState('');
  const [level, setLevel] = useState<AnnouncementLevel>('info');
  const [isActive, setIsActive] = useState(true);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  const [loaded, setLoaded] = useState<AnnouncementData | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const applyAnnouncement = (announcement: AnnouncementData | null) => {
    setLoaded(announcement);
    setTitle(announcement?.title || '');
    setContent(announcement?.content || '');
    setTitleEn(announcement?.titleEn || '');
    setContentEn(announcement?.contentEn || '');
    setLevel(announcement?.level || 'info');
    setIsActive(announcement ? announcement.isActive : true);
    setStartsAt(toLocalInput(announcement?.startsAt || 0));
    setEndsAt(toLocalInput(announcement?.endsAt || 0));
  };

  const callApi = async (method: 'GET' | 'PUT' | 'DELETE', body?: unknown): Promise<any> => {
    const trimmed = secret.trim();
    if (!trimmed) {
      throw new AnnouncementApiError('请先填写 MIGRATION_SECRET。', 0);
    }

    const headers: Record<string, string> = { 'X-Migration-Secret': trimmed };
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const response = await fetch(`${API_BASE_URL}/api/admin/announcement`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });

    const data = await parseJson(response);
    if (!response.ok || !data.success) {
      throw new AnnouncementApiError(
        data.error || data.message || `请求失败 (HTTP ${response.status})`,
        response.status
      );
    }
    return data;
  };

  const handleLoad = async () => {
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const data = await callApi('GET');
      applyAnnouncement(data.announcement || null);
      setMessage(data.announcement ? '已读取当前公告。' : '当前没有公告，填写后保存即可发布。');
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();

    if (!trimmedTitle || !trimmedContent) {
      setError('标题和内容不能为空。');
      return;
    }
    if (trimmedTitle.length > 100) {
      setError('标题最多 100 字。');
      return;
    }
    if (trimmedContent.length > 5000) {
      setError('内容最多 5000 字。');
      return;
    }

    const startSeconds = fromLocalInput(startsAt);
    const endSeconds = fromLocalInput(endsAt);
    if (startSeconds && endSeconds && endSeconds <= startSeconds) {
      setError('结束时间必须晚于开始时间。');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const data = await callApi('PUT', {
        title: trimmedTitle,
        content: trimmedContent,
        titleEn: titleEn.trim(),
        contentEn: contentEn.trim(),
        level,
        isActive,
        startsAt: startSeconds,
        endsAt: endSeconds
      });
      applyAnnouncement(data.announcement || null);
      setMessage(isActive ? '已保存并发布，前台会立即显示。' : '已保存，但当前为“停用”状态，前台不会显示。');
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('确定删除当前公告吗？删除后前台不再显示。')) return;

    setDeleting(true);
    setError('');
    setMessage('');

    try {
      await callApi('DELETE');
      applyAnnouncement(null);
      setMessage('公告已删除。');
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setDeleting(false);
    }
  };

  const previewLevel = LEVEL_PREVIEW[level] || LEVEL_PREVIEW.info;

  return (
    <Container className="py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">站点公告</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            发布后会显示在所有页面顶部，用户可以手动关闭；更新公告后已关闭的用户会重新看到。
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link to="/admin/migrate" className="rounded-md border px-3 py-2 text-sm hover:bg-muted">
            加密迁移
          </Link>
          <Link to="/" className="rounded-md border px-3 py-2 text-sm hover:bg-muted">
            返回首页
          </Link>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <div className="grid gap-4 md:grid-cols-[1fr_auto_auto] md:items-end">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">MIGRATION_SECRET</span>
            <div className="flex gap-2">
              <input
                type={showSecret ? 'text' : 'password'}
                value={secret}
                onChange={e => setSecret(e.target.value)}
                autoComplete="off"
                placeholder="粘贴 Worker 里配置的 MIGRATION_SECRET"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
              />
              <button
                type="button"
                onClick={() => setShowSecret(v => !v)}
                className="shrink-0 rounded-md border px-3 py-2 text-sm hover:bg-muted"
              >
                {showSecret ? '隐藏' : '显示'}
              </button>
            </div>
          </label>

          <button
            type="button"
            onClick={handleLoad}
            disabled={loading || saving || deleting}
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? '读取中...' : '读取当前公告'}
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={loading || saving || deleting}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存并发布'}
          </button>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">{SECRET_HINT}</p>

        {error && (
          <div className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}

        {message && !error && (
          <div className="mt-4 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
            {message}
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-lg font-semibold">公告内容</h2>

          <label className="mt-4 block">
            <span className="mb-1 block text-sm font-medium">标题（中文）</span>
            <input
              type="text"
              value={title}
              maxLength={100}
              onChange={e => setTitle(e.target.value)}
              placeholder="例如：秒邮服务升级通知"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>

          <label className="mt-4 block">
            <span className="mb-1 block text-sm font-medium">内容（中文）</span>
            <textarea
              value={content}
              maxLength={5000}
              rows={6}
              onChange={e => setContent(e.target.value)}
              placeholder="支持换行，建议控制在 2～3 行以内。"
              className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-primary/40"
            />
            <span className="mt-1 block text-right text-xs text-muted-foreground">{content.length} / 5000</span>
          </label>

          <details className="mt-4 rounded-md border p-3">
            <summary className="cursor-pointer text-sm font-medium">英文内容（可选）</summary>
            <label className="mt-3 block">
              <span className="mb-1 block text-sm font-medium">Title (English)</span>
              <input
                type="text"
                value={titleEn}
                maxLength={100}
                onChange={e => setTitleEn(e.target.value)}
                placeholder="Leave empty to use the Chinese title"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>
            <label className="mt-3 block">
              <span className="mb-1 block text-sm font-medium">Content (English)</span>
              <textarea
                value={contentEn}
                maxLength={5000}
                rows={4}
                onChange={e => setContentEn(e.target.value)}
                placeholder="Leave empty to use the Chinese content"
                className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>
          </details>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-lg font-semibold">展示设置</h2>

          <label className="mt-4 block">
            <span className="mb-1 block text-sm font-medium">样式</span>
            <select
              value={level}
              onChange={e => setLevel(e.target.value as AnnouncementLevel)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            >
              {LEVEL_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={e => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border"
            />
            <span>启用（取消勾选后前台不显示）</span>
          </label>

          <label className="mt-4 block">
            <span className="mb-1 block text-sm font-medium">开始时间（可选）</span>
            <input
              type="datetime-local"
              value={startsAt}
              onChange={e => setStartsAt(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>

          <label className="mt-4 block">
            <span className="mb-1 block text-sm font-medium">结束时间（可选）</span>
            <input
              type="datetime-local"
              value={endsAt}
              onChange={e => setEndsAt(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            />
            <span className="mt-1 block text-xs text-muted-foreground">留空表示不限制。</span>
          </label>

          <button
            type="button"
            onClick={handleDelete}
            disabled={loading || saving || deleting}
            className="mt-6 rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            {deleting ? '删除中...' : '删除公告'}
          </button>
        </div>
      </div>

      <div className="mt-6 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">前台预览</h2>
          <span className="text-xs text-muted-foreground">
            {loaded
              ? `上次保存：${formatTimestamp(loaded.updatedAt)} · 状态：${loaded.isActive ? '启用' : '停用'}`
              : '尚未读取到已保存的公告'}
          </span>
        </div>

        <div className={`mt-4 rounded-lg border px-4 py-3 ${previewLevel}`}>
          <p className="text-sm font-semibold break-words">{title.trim() || '公告标题'}</p>
          <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap break-words opacity-90">
            {content.trim() || '公告内容会显示在这里。'}
          </p>
        </div>

        <div className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
          <div>开始时间：{startsAt ? formatTimestamp(fromLocalInput(startsAt)) : '不限'}</div>
          <div>结束时间：{endsAt ? formatTimestamp(fromLocalInput(endsAt)) : '不限'}</div>
        </div>
      </div>

      <div className="mt-6 rounded-xl border bg-card p-4 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">使用说明</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>发布后所有页面顶部会显示公告，中英文用户分别看到对应语言的文案。</li>
          <li>用户点击关闭后不再显示；你更新公告内容后，用户会重新看到一次。</li>
          <li>公告内容不加密存储，不要在其中填写密码、密钥等敏感信息。</li>
          <li>取消“启用”或设置结束时间可让公告自动下线，不需要删除。</li>
        </ul>
      </div>
    </Container>
  );
};

export default AdminNoticePage;
