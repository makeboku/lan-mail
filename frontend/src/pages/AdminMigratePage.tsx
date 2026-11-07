import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Container from '../components/Container';
import { API_BASE_URL } from '../config';

type CategoryKey = 'mailboxes' | 'emails' | 'chatMessages' | 'attachments' | 'chatAttachments';

const CATEGORY_KEYS: CategoryKey[] = [
  'mailboxes',
  'emails',
  'chatMessages',
  'attachments',
  'chatAttachments'
];

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  mailboxes: '邮箱地址',
  emails: '邮件',
  chatMessages: '聊天消息',
  attachments: '邮件附件',
  chatAttachments: '聊天附件'
};

interface MigrationCounts {
  mailboxes: number;
  emails: number;
  chatMessages: number;
  attachments: number;
  chatAttachments: number;
}

interface StatusResponse {
  success: true;
  enabled: boolean;
  pending: MigrationCounts;
  skipped: MigrationCounts;
}

interface MigrateResponse {
  success: true;
  migrated: MigrationCounts;
  remaining: MigrationCounts;
}

const emptyCounts = (): MigrationCounts => ({
  mailboxes: 0,
  emails: 0,
  chatMessages: 0,
  attachments: 0,
  chatAttachments: 0
});

const sumCounts = (counts: MigrationCounts): number =>
  CATEGORY_KEYS.reduce((total, key) => total + (counts[key] || 0), 0);

const addCounts = (a: MigrationCounts, b: MigrationCounts): MigrationCounts => {
  const result = emptyCounts();
  for (const key of CATEGORY_KEYS) {
    result[key] = (a[key] || 0) + (b[key] || 0);
  }
  return result;
};

const sleep = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

const formatDuration = (ms: number): string => {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return `${minutes} 分 ${rest} 秒`;
  const hours = Math.floor(minutes / 60);
  return `${hours} 小时 ${minutes % 60} 分`;
};

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const parseJson = async (response: Response): Promise<any> => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text.slice(0, 200) };
  }
};

const requestStatus = async (secret: string): Promise<StatusResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/admin/encryption/status`, {
    headers: { 'X-Migration-Secret': secret }
  });
  const data = await parseJson(response);
  if (!response.ok || !data.success) {
    throw new ApiError(data.error || data.message || `请求失败 (HTTP ${response.status})`, response.status);
  }
  return data as StatusResponse;
};

const requestMigrate = async (secret: string, limit: number): Promise<MigrateResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/admin/encryption/migrate`, {
    method: 'POST',
    headers: {
      'X-Migration-Secret': secret,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ limit })
  });
  const data = await parseJson(response);
  if (!response.ok || !data.success) {
    throw new ApiError(data.error || data.message || `请求失败 (HTTP ${response.status})`, response.status);
  }
  return data as MigrateResponse;
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof ApiError && error.status === 401) {
    return 'MIGRATION_SECRET 不正确，或服务端没有配置 MIGRATION_SECRET。';
  }
  if (error instanceof Error) return error.message;
  return String(error);
};

const AdminMigratePage: React.FC = () => {
  const [secret, setSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [limit, setLimit] = useState(50);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [checking, setChecking] = useState(false);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [batch, setBatch] = useState(0);
  const [migrated, setMigrated] = useState<MigrationCounts>(emptyCounts);
  const [initialTotal, setInitialTotal] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  const stopRef = useRef(false);
  const runningRef = useRef(false);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  const log = (message: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [`[${time}] ${message}`, ...prev].slice(0, 200));
  };

  const pendingTotal = status ? sumCounts(status.pending) : 0;
  const skippedTotal = status ? sumCounts(status.skipped) : 0;
  const processed = Math.max(0, initialTotal - pendingTotal);
  const progress = initialTotal > 0 ? Math.min(100, Math.round((processed / initialTotal) * 100)) : done ? 100 : 0;

  const handleCheck = async () => {
    const trimmed = secret.trim();
    if (!trimmed) {
      setError('请先填写 MIGRATION_SECRET。');
      return;
    }

    setChecking(true);
    setError('');
    setDone(false);

    try {
      const data = await requestStatus(trimmed);
      const total = sumCounts(data.pending);
      setStatus(data);
      setInitialTotal(total);
      setDone(total === 0);
      log(`状态检查完成：加密${data.enabled ? '已启用' : '未启用'}，待迁移 ${total} 条，已跳过 ${sumCounts(data.skipped)} 条。`);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setChecking(false);
    }
  };

  const handleStart = async () => {
    const trimmed = secret.trim();
    if (!trimmed) {
      setError('请先填写 MIGRATION_SECRET。');
      return;
    }
    if (runningRef.current) return;

    runningRef.current = true;
    stopRef.current = false;
    setRunning(true);
    setDone(false);
    setError('');
    setLogs([]);
    setBatch(0);
    setMigrated(emptyCounts());
    setStartedAt(Date.now());
    setNow(Date.now());

    try {
      const initialStatus = await requestStatus(trimmed);
      setStatus(initialStatus);

      const total = sumCounts(initialStatus.pending);
      setInitialTotal(total);

      if (!initialStatus.enabled) {
        throw new Error('服务端未启用加密，请先在 Worker 设置 MAIL_ENCRYPTION_KEY（至少 16 位）并重新部署。');
      }

      if (total === 0) {
        setDone(true);
        log('没有待迁移数据，已经全部是密文。');
        log('如果旧库里明明还有明文数据，请检查 Worker 是否绑定到了旧 D1，而不是新建的空库。');
        return;
      }

      log(`开始迁移：待处理 ${total} 条，每批 ${limit} 条。`);
      log('迁移期间请保持这个标签页打开并处于前台，任务就在浏览器里循环执行。');

      let currentLimit = limit;
      let previousRemaining = total;
      let stalled = 0;
      let migratedTotal = emptyCounts();

      for (let i = 0; ; i += 1) {
        if (stopRef.current) {
          log('已手动停止。下次点击“开始迁移”会从上次位置继续。');
          break;
        }

        let data: MigrateResponse;

        try {
          data = await requestMigrate(trimmed, currentLimit);
        } catch (e) {
          if (e instanceof ApiError && e.status === 401) throw e;

          if (currentLimit > 5) {
            currentLimit = Math.max(5, Math.floor(currentLimit / 2));
            log(`本批请求失败：${getErrorMessage(e)}。自动把每批数量降到 ${currentLimit} 后重试。`);
            await sleep(1500);
            i -= 1;
            continue;
          }

          throw e;
        }

        migratedTotal = addCounts(migratedTotal, data.migrated);
        setMigrated(migratedTotal);
        setBatch(i + 1);
        setStatus(prev => (prev ? { ...prev, pending: data.remaining } : prev));

        const remaining = sumCounts(data.remaining);
        log(`第 ${i + 1} 批：本批迁移 ${sumCounts(data.migrated)} 条，剩余 ${remaining} 条。`);

        if (remaining === 0) {
          setDone(true);
          log('全部迁移完成。');
          break;
        }

        if (remaining >= previousRemaining) {
          stalled += 1;
          if (stalled >= 5) {
            log('连续 5 批剩余数量没有减少，已自动停止。请检查下方“已跳过”数量，或查看 Worker 日志。');
            break;
          }
        } else {
          stalled = 0;
        }

        previousRemaining = remaining;
        await sleep(300);
      }

      // 结束后再拉一次最终状态，确保页面显示的是服务端真实结果
      const finalStatus = await requestStatus(trimmed);
      setStatus(finalStatus);
      setInitialTotal(prev => (prev > 0 ? prev : sumCounts(finalStatus.pending)));

      const finalPending = sumCounts(finalStatus.pending);
      if (finalPending === 0) {
        setDone(true);
        log('最终检查：待迁移 0 条。');
      } else {
        log(`最终检查：仍有 ${finalPending} 条待迁移。`);
      }

      log(`已跳过 ${sumCounts(finalStatus.skipped)} 条（这些行无法自动迁移，仍保持原样）。`);
    } catch (e) {
      setError(getErrorMessage(e));
      log(`迁移中止：${getErrorMessage(e)}`);
    } finally {
      runningRef.current = false;
      setRunning(false);
      setStartedAt(null);
    }
  };

  const handleStop = () => {
    stopRef.current = true;
    log('已请求停止，当前批次结束后会停下。');
  };

  const handleCopyLogs = async () => {
    try {
      await navigator.clipboard.writeText([...logs].reverse().join('\n'));
      log('日志已复制到剪贴板。');
    } catch {
      log('复制失败，请手动选中日志。');
    }
  };

  return (
    <Container className="py-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">数据加密迁移</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            把旧 D1 数据库里的明文邮箱地址、邮件、附件和聊天内容批量改写为密文。
          </p>
        </div>
        <Link to="/" className="shrink-0 rounded-md border px-3 py-2 text-sm hover:bg-muted">
          返回首页
        </Link>
      </div>

      <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        <p className="font-semibold">开始前请确认：</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Worker 已设置 <code>MAIL_ENCRYPTION_KEY</code>，并且你已经备份保存，之后不能修改或丢失。</li>
          <li>当前 Worker 绑定的是<strong>旧数据库</strong>，不是新建的空库。</li>
          <li>已经导出备份旧 D1。迁移会直接改写原表，无法自动回滚。</li>
        </ul>
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
                placeholder="粘贴 Worker 里配置的迁移密钥"
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

          <label className="block">
            <span className="mb-1 block text-sm font-medium">每批数量</span>
            <select
              value={limit}
              onChange={e => setLimit(Number(e.target.value))}
              disabled={running}
              className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value={5}>5（最稳）</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50（最快）</option>
            </select>
          </label>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCheck}
              disabled={checking || running}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              {checking ? '检查中...' : '检查状态'}
            </button>
            {running ? (
              <button
                type="button"
                onClick={handleStop}
                className="rounded-md bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600"
              >
                停止
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStart}
                disabled={checking}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                开始迁移
              </button>
            )}
          </div>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          密钥只保存在当前页面内存里，不会写入 localStorage。刷新页面后需要重新填写。
        </p>

        {error && (
          <div className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">加密状态</div>
          <div className="mt-1 text-lg font-semibold">
            {status ? (status.enabled ? '已启用' : '未启用') : '未检查'}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">待迁移</div>
          <div className="mt-1 text-lg font-semibold">{status ? pendingTotal : '-'}</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">已跳过</div>
          <div className="mt-1 text-lg font-semibold">{status ? skippedTotal : '-'}</div>
        </div>
      </div>

      {(running || done || batch > 0) && (
        <div className="mt-6 rounded-xl border bg-card p-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-medium">
              {done ? '迁移完成' : running ? '正在迁移...' : '迁移已停止'}
            </span>
            <span className="text-muted-foreground">
              第 {batch} 批 · 本次已迁移 {sumCounts(migrated)} 条
              {startedAt ? ` · 已运行 ${formatDuration(now - startedAt)}` : ''}
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-2 text-right text-xs text-muted-foreground">{progress}%</div>
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-xl border bg-card">
        <div className="border-b px-4 py-3 text-sm font-medium">分类进度</div>
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">分类</th>
              <th className="px-4 py-2 text-right font-medium">待迁移</th>
              <th className="px-4 py-2 text-right font-medium">已跳过</th>
            </tr>
          </thead>
          <tbody>
            {CATEGORY_KEYS.map(key => (
              <tr key={key} className="border-t">
                <td className="px-4 py-2">{CATEGORY_LABELS[key]}</td>
                <td className="px-4 py-2 text-right">{status ? status.pending[key] : '-'}</td>
                <td className="px-4 py-2 text-right">{status ? status.skipped[key] : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 rounded-xl border bg-card">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <span className="text-sm font-medium">运行日志</span>
          <button
            type="button"
            onClick={handleCopyLogs}
            disabled={logs.length === 0}
            className="rounded-md border px-3 py-1 text-xs hover:bg-muted disabled:opacity-50"
          >
            复制日志
          </button>
        </div>
        <div className="max-h-72 overflow-auto p-4 font-mono text-xs leading-5 text-muted-foreground">
          {logs.length === 0 ? (
            <div>暂无日志，点击“检查状态”或“开始迁移”。</div>
          ) : (
            logs.map((line, index) => (
              <div key={`${index}-${line}`} className="whitespace-pre-wrap break-all">
                {line}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="mt-6 rounded-xl border bg-card p-4 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">迁移完成后</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>确认“待迁移”全部为 0，再用旧邮箱登录检查邮件和附件。</li>
          <li>如果“已跳过”大于 0，说明这些行无法自动迁移，仍保持原样。可在 D1 执行 <code>SELECT * FROM encryption_skipped LIMIT 20;</code> 查看原因。</li>
          <li>迁移完成后建议删除或更换 <code>MIGRATION_SECRET</code>，但不要动 <code>MAIL_ENCRYPTION_KEY</code>。</li>
        </ul>
      </div>
    </Container>
  );
};

export default AdminMigratePage;
