import { Hono, Context } from 'hono';
import { cors } from 'hono/cors';
import { Env, Mailbox } from './types';
import { 
  createMailbox, 
  getMailbox, 
  loginMailbox,
  deleteMailbox, 
  getEmails, 
  getEmail, 
  deleteEmail,
  markEmailAsUnread,
  getAttachments,
  getAttachment,
  getMailboxCount,
  getMailboxCountByIpLast24h,
  batchDeleteEmails,
  batchMarkEmailsAsRead,
  batchMarkEmailsAsUnread,
  getMailboxId,
  verifyMailboxPassword,
  enforceRateLimit,
  sendInternalMessage,
  getChatMessages,
  getChatConversations,
  deleteInternalMessages,
  markChatRead,
  getUnreadChatCount,
  getEmailOwnerMailboxId,
  getAttachmentMailboxId,
  getMailboxAddressById,
  getEmailsOwnerMailboxId,
  saveChatAttachment,
  getChatAttachment,
  canAccessChatAttachment,
  syncChatReadStatus,
  getDeletedChatKeys,
  editInternalMessage,
  deleteChatMessage,
  getEncryptionStatus,
  encryptLegacyBatch
} from './database';
import { generateRandomAddress, generatePassword, isValidEmailAddress, extractMailboxName, getCurrentTimestamp } from './utils';
import { decryptAddress } from './crypto';

// 创建 Hono 应用
const app = new Hono<{ Bindings: Env }>();

type AuthenticatedContext = Context<{ Bindings: Env }>;

// 从请求头获取邮箱读取密码并校验（鉴权）
async function requireMailboxAuth(c: AuthenticatedContext, address: string): Promise<Mailbox | null> {
  const password = c.req.header('X-Mailbox-Password') || '';
  if (!password) return null;
  return verifyMailboxPassword(c.env.DB, address, password);
}

// 校验是否有权访问某个邮箱ID的数据（先反查地址再校验密码）
async function authOwnerMailbox(c: AuthenticatedContext, mailboxId: string): Promise<boolean> {
  const address = await getMailboxAddressById(c.env.DB, mailboxId);
  if (!address) return false;
  return !!(await requireMailboxAuth(c, address));
}

// 校验是否有权访问某封邮件（返回 'notfound' 表示邮件不存在）
async function emailAccess(c: AuthenticatedContext, emailId: string): Promise<boolean | 'notfound'> {
  const mailboxId = await getEmailOwnerMailboxId(c.env.DB, emailId);
  if (!mailboxId) return 'notfound';
  if (!(await authOwnerMailbox(c, mailboxId))) return false;
  return true;
}

// 校验是否有权访问某附件（返回 'notfound' 表示附件不存在）
async function attachmentAccess(c: AuthenticatedContext, attachmentId: string): Promise<boolean | 'notfound'> {
  const mailboxId = await getAttachmentMailboxId(c.env.DB, attachmentId);
  if (!mailboxId) return 'notfound';
  if (!(await authOwnerMailbox(c, mailboxId))) return false;
  return true;
}

// 校验是否有权批量操作这些邮件
async function emailsBatchAccess(c: AuthenticatedContext, emailIds: string[]): Promise<boolean | 'notfound' | 'mixed'> {
  const { exists, mailboxId } = await getEmailsOwnerMailboxId(c.env.DB, emailIds);
  if (exists === 0) return 'notfound';
  if (!mailboxId) return 'mixed';
  if (!(await authOwnerMailbox(c, mailboxId))) return false;
  return true;
}

// 去掉密码等敏感字段后返回给前端的邮箱信息
function publicMailbox(mailbox: Mailbox) {
  const { password, ...rest } = mailbox;
  return rest;
}

// 401 响应
function unauthorized(c: AuthenticatedContext) {
  return c.json({ success: false, error: '需要邮箱密码鉴权' }, 401);
}

// 添加 CORS 中间件
app.use('/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'X-Mailbox-Password', 'X-Migration-Secret'],
  maxAge: 86400,
}));

// 安全响应头中间件
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('X-XSS-Protection', '0');
});

// 健康检查端点
app.get('/', (c) => {
  return c.json({ status: 'ok', message: '临时邮箱系统API正常运行' });
});

// 获取系统配置
app.get('/api/config', (c) => {
  try {
    const emailDomains = c.env.VITE_EMAIL_DOMAIN || '';
    const domains = emailDomains.split(',').map((domain: string) => domain.trim()).filter((domain: string) => domain);
    
    const externalLinksRaw = c.env.VITE_EXTERNAL_LINKS || '';
    const externalLinks = externalLinksRaw.split(',').filter(Boolean).map((pair: string) => {
      const [label, url] = pair.split('|');
      return { label: label?.trim() || url, url: url?.trim() || '' };
    }).filter((l: { url: string }) => l.url);
    
    return c.json({ 
      success: true, 
      config: {
        emailDomains: domains,
        externalLinks: externalLinks.length > 0 ? externalLinks : undefined
      }
    });
  } catch (error) {
    console.error('获取配置失败:', error);
    return c.json({ 
      success: false, 
      error: '获取配置失败',
      message: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// 获取系统统计信息
app.get('/api/stats', async (c) => {
  try {
    const count = await getMailboxCount(c.env.DB);
    return c.json({ 
      success: true, 
      stats: {
        mailboxCount: count
      }
    });
  } catch (error) {
    console.error('获取统计信息失败:', error);
    return c.json({ 
      success: false, 
      error: '获取统计信息失败',
      message: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});


// 创建邮箱
app.post('/api/mailboxes', async (c) => {
  try {
    const body = await c.req.json();
    
    // 验证参数
    if (body.address && typeof body.address !== 'string') {
      return c.json({ success: false, error: '无效的邮箱地址' }, 400);
    }
    if (body.password !== undefined && (typeof body.password !== 'string' || body.password.length < 6)) {
      return c.json({ success: false, error: '密码长度至少需要 6 个字符' }, 400);
    }
    
    const expiresInHours = 876000; // 100年，相当于永久
    
    // 获取客户端IP
    const ip = c.req.header('CF-Connecting-IP') || 'unknown';
    
    // 检查 IP 频率限制：24小时内最多创建10个
    if (ip !== 'unknown') {
      const ipCount = await getMailboxCountByIpLast24h(c.env.DB, ip);
      if (ipCount >= 10) {
        return c.json({ success: false, error: '您的 IP 在 24 小时内创建邮箱数量已达上限 (10个)' }, 429);
      }
    }
    
    // 生成或使用提供的地址（统一小写，避免大小写不一致导致后续鉴权/发信失败）
    const address = (body.address || generateRandomAddress()).trim().toLowerCase();
    // 使用前端提供的密码，或生成随机密码
    const password = body.password || generatePassword();
    
    // 检查邮箱是否已存在
    const existingMailbox = await getMailbox(c.env.DB, address);
    if (existingMailbox) {
      return c.json({ success: false, error: '邮箱地址已存在' }, 400);
    }
    
    // 创建邮箱
    const mailbox = await createMailbox(c.env.DB, {
      address,
      password,
      expiresInHours,
      ipAddress: ip,
    });
    
    // 明文密码单独返回（仅展示/保存用），mailbox 中不包含密码及哈希
    return c.json({ success: true, mailbox: publicMailbox(mailbox), password });
  } catch (error) {
    console.error('创建邮箱失败:', error);
    return c.json({ 
      success: false, 
      error: '创建邮箱失败',
      message: error instanceof Error ? error.message : String(error)
    }, 400);
  }
});

// 获取邮箱信息
app.get('/api/mailboxes/:address', async (c) => {
  try {
    const address = c.req.param('address');
    const mailbox = await getMailbox(c.env.DB, address);
    
    if (!mailbox) {
      return c.json({ success: false, error: '邮箱不存在' }, 404);
    }
    
    const auth = await requireMailboxAuth(c, address);
    if (!auth) {
      return unauthorized(c);
    }
    
    return c.json({ success: true, mailbox: publicMailbox(mailbox) });
  } catch (error) {
    console.error('获取邮箱失败:', error);
    return c.json({ 
      success: false, 
      error: '获取邮箱失败',
      message: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// 登录邮箱
app.post('/api/mailboxes/login', async (c) => {
  try {
    const body = await c.req.json();
    
    // 验证参数
    if (!body.address || !body.password) {
      return c.json({ success: false, error: '邮箱地址和密码不能为空' }, 400);
    }
    
    if (typeof body.address !== 'string' || typeof body.password !== 'string') {
      return c.json({ success: false, error: '无效的参数' }, 400);
    }
    
    // 尝试登录
    const mailbox = await loginMailbox(c.env.DB, body.address, body.password);
    
    if (!mailbox) {
      // 登录失败：按 IP 限流，防爆破
      const ip = c.req.header('CF-Connecting-IP') || 'unknown';
      if (ip !== 'unknown') {
        const limited = await enforceRateLimit(c.env.DB, `login:${ip}`, 900, 10);
        if (limited) {
          return c.json({ success: false, error: '尝试次数过多，请 15 分钟后再试' }, 429);
        }
      }
      return c.json({ success: false, error: '邮箱地址或密码错误' }, 401);
    }
    
    return c.json({ success: true, mailbox: publicMailbox(mailbox) });
  } catch (error) {
    console.error('登录失败:', error);
    return c.json({ 
      success: false, 
      error: '登录失败',
      message: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// 删除邮箱
app.delete('/api/mailboxes/:address', async (c) => {
  try {
    const address = c.req.param('address');
    const auth = await requireMailboxAuth(c, address);
    if (!auth) {
      const exists = await getMailboxId(c.env.DB, address);
      return exists ? unauthorized(c) : c.json({ success: false, error: '邮箱不存在' }, 404);
    }
    await deleteMailbox(c.env.DB, address);
    
    return c.json({ success: true });
  } catch (error) {
    console.error('删除邮箱失败:', error);
    return c.json({ 
      success: false, 
      error: '删除邮箱失败',
      message: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// 获取邮件列表
app.get('/api/mailboxes/:address/emails', async (c) => {
  try {
    const address = c.req.param('address');
    const mailbox = await requireMailboxAuth(c, address);
    if (!mailbox) {
      const exists = await getMailboxId(c.env.DB, address);
      return exists ? unauthorized(c) : c.json({ success: false, error: '邮箱不存在' }, 404);
    }
    
    const emails = await getEmails(c.env.DB, mailbox.id);
    
    return c.json({ success: true, emails });
  } catch (error) {
    console.error('获取邮件列表失败:', error);
    return c.json({ 
      success: false, 
      error: '获取邮件列表失败',
      message: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// 站内发信（发送站内消息给本站的另一邮箱，支持附件与emoji）
app.post('/api/mailboxes/:address/messages', async (c) => {
  try {
    const address = c.req.param('address').trim().toLowerCase();
    const body = await c.req.json();

    if (!body.toAddress || typeof body.toAddress !== 'string') {
      return c.json({ success: false, error: '请填写收件人邮箱地址' }, 400);
    }

    let attachmentIds: string[] = [];
    if (body.attachmentIds !== undefined) {
      if (!Array.isArray(body.attachmentIds) || !body.attachmentIds.every((a: unknown) => typeof a === 'string')) {
        return c.json({ success: false, error: '附件ID格式不正确' }, 400);
      }
      attachmentIds = body.attachmentIds.slice(0, 5);
    }

    const content = (typeof body.content === 'string' ? body.content : '').trim();
    if (!content && attachmentIds.length === 0) {
      return c.json({ success: false, error: '消息内容不能为空' }, 400);
    }
    if (content.length > 5000) {
      return c.json({ success: false, error: '单条消息长度不能超过 5000 字符' }, 400);
    }

    const toAddress = body.toAddress.trim().toLowerCase();

    if (!isValidEmailAddress(toAddress)) {
      return c.json({ success: false, error: '收件人地址格式不正确' }, 400);
    }

    // 发件人必须是本站邮箱且通过密码鉴权（防止冒用他人地址发信）
    if (!body.password || typeof body.password !== 'string') {
      return c.json({ success: false, error: '需要密码鉴权后才能发送站内消息' }, 401);
    }
    const fromMailbox = await verifyMailboxPassword(c.env.DB, address, body.password);
    if (!fromMailbox) {
      return c.json({ success: false, error: '发件邮箱或密码错误' }, 401);
    }

    // 不能给自己发信
    if (toAddress === address) {
      return c.json({ success: false, error: '不能给自己发送站内消息' }, 400);
    }

    // 收件人必须在本站存在（站内发信）
    const toMailboxId = await getMailboxId(c.env.DB, toAddress);
    if (!toMailboxId) {
      return c.json({ success: false, error: '对方邮箱不存在，请确认对方已在秒邮注册' }, 404);
    }

    // 校验附件归属且未被使用
    if (attachmentIds.length > 0) {
      const placeholders = attachmentIds.map(() => '?').join(',');
      const check = await c.env.DB.prepare(
        `SELECT COUNT(*) AS cnt FROM chat_attachments WHERE id IN (${placeholders}) AND mailbox_id = ? AND msg_key IS NULL`
      ).bind(...attachmentIds, fromMailbox.id).first<{ cnt: number }>();
      if ((check?.cnt || 0) !== attachmentIds.length) {
        return c.json({ success: false, error: '存在无效或已被使用的附件，请重新上传' }, 400);
      }
    }

    // 按发件邮箱限流，防刷屏
    const rateLimited = await enforceRateLimit(c.env.DB, `send:${address}`, 60, 30);
    if (rateLimited) {
      return c.json({ success: false, error: '发送过于频繁，请稍后再试' }, 429);
    }

    const fromName = extractMailboxName(address);
    const toMailbox = { id: toMailboxId, address: toAddress } as Mailbox;
    const message = await sendInternalMessage(c.env.DB, fromMailbox, toMailbox, fromName, content, attachmentIds);

    return c.json({ success: true, message });
  } catch (error) {
    console.error('站内发信失败:', error);
    return c.json({
      success: false,
      error: '站内发信失败',
      message: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// 获取与对方的站内对话（增量轮询，降低 D1 读取量）
app.get('/api/mailboxes/:address/chat', async (c) => {
  try {
    const address = c.req.param('address').trim().toLowerCase();
    const withAddress = (c.req.query('with') || '').trim().toLowerCase();
    const since = Number(c.req.query('since')) || 0;
    // 导出时允许拉取全部历史，上限放宽到 5000
    const limit = Math.min(Number(c.req.query('limit')) || 30, 5000);

    if (!withAddress || !isValidEmailAddress(withAddress)) {
      return c.json({ success: false, error: '缺少有效的对方邮箱地址' }, 400);
    }

    const auth = await requireMailboxAuth(c, address);
    if (!auth) {
      const exists = await getMailboxId(c.env.DB, address);
      return exists ? unauthorized(c) : c.json({ success: false, error: '邮箱不存在' }, 404);
    }
    const mailboxId = auth.id;

    const peerAddress = withAddress;
    const messages = await getChatMessages(c.env.DB, mailboxId, peerAddress, since, limit);

    // 返回该时段内被删除的 msg_key，供客户端移除本地副本（轮询时）
    const deleted = since > 0 ? await getDeletedChatKeys(c.env.DB, since) : { keys: [], maxDeletedAt: 0 };

    // 仅在初始打开聊天（since=0）时标记已读，轮询（since>0）不写入，降低 D1 写入量
    if (since === 0) {
      await markChatRead(c.env.DB, mailboxId, peerAddress);
    }

    return c.json({ success: true, messages, deletedKeys: deleted.keys, deletedAt: deleted.maxDeletedAt });
  } catch (error) {
    console.error('获取站内对话失败:', error);
    return c.json({
      success: false,
      error: '获取站内对话失败',
      message: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// 获取当前邮箱的站内会话列表（谁发来、发了什么、几条未读）
app.get('/api/mailboxes/:address/chat/conversations', async (c) => {
  try {
    const address = c.req.param('address').trim().toLowerCase();
    const auth = await requireMailboxAuth(c, address);
    if (!auth) {
      const exists = await getMailboxId(c.env.DB, address);
      return exists ? unauthorized(c) : c.json({ success: false, error: '邮箱不存在' }, 404);
    }
    const mailboxId = auth.id;
    const conversations = await getChatConversations(c.env.DB, mailboxId, address);
    return c.json({ success: true, conversations });
  } catch (error) {
    console.error('获取站内会话列表失败:', error);
    return c.json({
      success: false,
      error: '获取站内会话列表失败',
      message: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// 获取当前邮箱未读站内消息数量（用于导航角标与首页提示条）
app.get('/api/mailboxes/:address/chat/unread', async (c) => {
  try {
    const address = c.req.param('address').trim().toLowerCase();
    const auth = await requireMailboxAuth(c, address);
    if (!auth) {
      const exists = await getMailboxId(c.env.DB, address);
      return exists ? unauthorized(c) : c.json({ success: false, error: '邮箱不存在' }, 404);
    }
    const count = await getUnreadChatCount(c.env.DB, auth.id);
    return c.json({ success: true, count });
  } catch (error) {
    console.error('获取未读站内消息数失败:', error);
    return c.json({
      success: false,
      error: '获取未读站内消息数失败',
      message: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// 上传站内聊天附件（先上传后随消息发送；base64 编码，最多5个/次，单文件不超过10MB）
app.post('/api/mailboxes/:address/chat/attachments', async (c) => {
  try {
    const address = c.req.param('address').trim().toLowerCase();
    const auth = await requireMailboxAuth(c, address);
    if (!auth) {
      const exists = await getMailboxId(c.env.DB, address);
      return exists ? unauthorized(c) : c.json({ success: false, error: '邮箱不存在' }, 404);
    }

    const body = await c.req.json();
    const files = Array.isArray(body.files) ? body.files.slice(0, 5) : [];
    if (files.length === 0) {
      return c.json({ success: false, error: '请选择要上传的附件' }, 400);
    }

    // 上传限流：每邮箱每10秒最多5次
    const limited = await enforceRateLimit(c.env.DB, `chat-upload:${address}`, 10, 5);
    if (limited) {
      return c.json({ success: false, error: '上传过于频繁，请稍后再试' }, 429);
    }

    const saved = [];
    for (const file of files) {
      if (typeof file.filename !== 'string' || typeof file.content !== 'string' || !file.content) {
        return c.json({ success: false, error: '附件参数不完整' }, 400);
      }
      const size = typeof file.size === 'number' ? file.size : Math.floor(file.content.length * 3 / 4);
      if (size > 10 * 1024 * 1024) {
        return c.json({ success: false, error: '单个附件不能超过 10MB' }, 413);
      }
      saved.push(await saveChatAttachment(c.env.DB, auth.id, {
        filename: typeof file.filename === 'string' ? file.filename : 'attachment',
        mimeType: typeof file.mimeType === 'string' ? file.mimeType : 'application/octet-stream',
        content: file.content,
        size,
      }));
    }

    return c.json({ success: true, attachments: saved });
  } catch (error) {
    console.error('上传站内聊天附件失败:', error);
    return c.json({
      success: false,
      error: '上传附件失败',
      message: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// 下载站内聊天附件（上传者本人及消息收发双方可访问）
app.get('/api/mailboxes/:address/chat/attachments/:id', async (c) => {
  try {
    const address = c.req.param('address').trim().toLowerCase();
    const id = c.req.param('id');
    const auth = await requireMailboxAuth(c, address);
    if (!auth) {
      const exists = await getMailboxId(c.env.DB, address);
      return exists ? unauthorized(c) : c.json({ success: false, error: '邮箱不存在' }, 404);
    }

    const allowed = await canAccessChatAttachment(c.env.DB, id, auth.id);
    if (!allowed) {
      return c.json({ success: false, error: '附件不存在或无权访问' }, 404);
    }

    const attachment = await getChatAttachment(c.env.DB, id);
    if (!attachment) {
      return c.json({ success: false, error: '附件不存在' }, 404);
    }

    const binaryContent = atob(attachment.content);
    const bytes = new Uint8Array(binaryContent.length);
    for (let i = 0; i < binaryContent.length; i++) {
      bytes[i] = binaryContent.charCodeAt(i);
    }
    c.header('Content-Type', attachment.mimeType);
    c.header('Content-Disposition', `attachment; filename="${encodeURIComponent(attachment.filename)}"`);
    return c.body(bytes);
  } catch (error) {
    console.error('下载站内聊天附件失败:', error);
    return c.json({
      success: false,
      error: '下载附件失败',
      message: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// 已读回执同步：上报我已读的消息 + 下载对方是否已读我的消息（每小时一次，节流）
// 上报的 messageIds 为本邮箱收到的在我方副本中已查看的消息ID
app.post('/api/mailboxes/:address/chat/read-sync', async (c) => {
  try {
    const address = c.req.param('address').trim().toLowerCase();
    const auth = await requireMailboxAuth(c, address);
    if (!auth) {
      const exists = await getMailboxId(c.env.DB, address);
      return exists ? unauthorized(c) : c.json({ success: false, error: '邮箱不存在' }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const reportedReadIds = (Array.isArray(body.messageIds) ? body.messageIds : [])
      .filter((x: unknown): x is string => typeof x === 'string')
      .slice(0, 500);

    const result = await syncChatReadStatus(c.env.DB, auth.id, address, reportedReadIds);
    return c.json({ success: true, ...result });
  } catch (error) {
    console.error('已读回执同步失败:', error);
    return c.json({
      success: false,
      error: '已读回执同步失败',
      message: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// 编辑一条站内消息（仅发送者可编辑，双方副本同步更新并记录编辑时间，对方增量轮询可发现）
app.post('/api/mailboxes/:address/chat/messages/:msgKey/edit', async (c) => {
  try {
    const address = c.req.param('address').trim().toLowerCase();
    const msgKey = c.req.param('msgKey').trim();
    const auth = await requireMailboxAuth(c, address);
    if (!auth) {
      const exists = await getMailboxId(c.env.DB, address);
      return exists ? unauthorized(c) : c.json({ success: false, error: '邮箱不存在' }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const content = (typeof body.content === 'string' ? body.content : '').trim();
    if (!content) {
      return c.json({ success: false, error: '消息内容不能为空' }, 400);
    }
    if (content.length > 5000) {
      return c.json({ success: false, error: '单条消息长度不能超过 5000 字符' }, 400);
    }
    if (!msgKey || msgKey.length > 64) {
      return c.json({ success: false, error: '非法的消息标识' }, 400);
    }

    // 从消息中解析对方地址：编辑的消息必须存在于我的会话中
    const peerRow = await c.env.DB.prepare(
      `SELECT to_address FROM chat_messages WHERE msg_key = ? AND mailbox_id = ? LIMIT 1`
    ).bind(msgKey, auth.id).first<{ to_address: string }>();
    if (!peerRow) {
      return c.json({ success: false, error: '消息不存在或无权编辑' }, 404);
    }

    const updated = await editInternalMessage(c.env.DB, auth.id, address, await decryptAddress(peerRow.to_address), msgKey, content);
    if (!updated) {
      return c.json({ success: false, error: '消息不存在或无权编辑' }, 404);
    }
    return c.json({ success: true, message: updated });
  } catch (error) {
    console.error('编辑站内消息失败:', error);
    return c.json({
      success: false,
      error: '编辑消息失败',
      message: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// 删除一条站内消息（仅发送者可删除；双方副本连同附件一并删除，对方增量轮询可发现）
app.delete('/api/mailboxes/:address/chat/messages/:msgKey', async (c) => {
  try {
    const address = c.req.param('address').trim().toLowerCase();
    const msgKey = c.req.param('msgKey').trim();
    const auth = await requireMailboxAuth(c, address);
    if (!auth) {
      const exists = await getMailboxId(c.env.DB, address);
      return exists ? unauthorized(c) : c.json({ success: false, error: '邮箱不存在' }, 404);
    }
    if (!msgKey || msgKey.length > 64) {
      return c.json({ success: false, error: '非法的消息标识' }, 400);
    }

    const peerRow = await c.env.DB.prepare(
      `SELECT to_address FROM chat_messages WHERE msg_key = ? AND mailbox_id = ? LIMIT 1`
    ).bind(msgKey, auth.id).first<{ to_address: string }>();
    if (!peerRow) {
      return c.json({ success: false, error: '消息不存在或无权删除' }, 404);
    }

    const deleted = await deleteChatMessage(c.env.DB, auth.id, address, await decryptAddress(peerRow.to_address), msgKey);
    if (!deleted) {
      return c.json({ success: false, error: '消息不存在或无权删除' }, 404);
    }
    return c.json({ success: true });
  } catch (error) {
    console.error('删除站内消息失败:', error);
    return c.json({
      success: false,
      error: '删除消息失败',
      message: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// 清空与某用户的站内聊天记录（按小时，双方副本一并删除）
app.delete('/api/mailboxes/:address/chat', async (c) => {
  try {
    const address = c.req.param('address').trim().toLowerCase();
    const withAddress = (c.req.query('with') || '').trim().toLowerCase();
    const hours = Number(c.req.query('hours')) || 0;

    if (!withAddress || !isValidEmailAddress(withAddress)) {
      return c.json({ success: false, error: '缺少有效的对方邮箱地址' }, 400);
    }

    const auth = await requireMailboxAuth(c, address);
    if (!auth) {
      const exists = await getMailboxId(c.env.DB, address);
      return exists ? unauthorized(c) : c.json({ success: false, error: '邮箱不存在' }, 404);
    }

    // 双方邮箱都必须存在
    const myId = auth.id;
    const peerId = await getMailboxId(c.env.DB, withAddress);
    if (!myId || !peerId) {
      return c.json({ success: false, error: '邮箱不存在' }, 404);
    }

    // hours > 0 表示仅清空最近 N 小时；0 表示清空全部
    const afterTs = hours > 0 ? getCurrentTimestamp() - hours * 3600 : 0;
    const deleted = await deleteInternalMessages(c.env.DB, myId, address, peerId, withAddress, afterTs);

    return c.json({ success: true, deleted });
  } catch (error) {
    console.error('清空站内聊天记录失败:', error);
    return c.json({
      success: false,
      error: '清空站内聊天记录失败',
      message: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// 获取邮件详情
app.get('/api/emails/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const access = await emailAccess(c, id);
    if (access === 'notfound') {
      return c.json({ success: false, error: '邮件不存在' }, 404);
    }
    if (access === false) {
      return unauthorized(c);
    }
    
    const email = await getEmail(c.env.DB, id);
    
    if (!email) {
      return c.json({ success: false, error: '邮件不存在' }, 404);
    }
    
    return c.json({ success: true, email });
  } catch (error) {
    console.error('获取邮件详情失败:', error);
    return c.json({ 
      success: false, 
      error: '获取邮件详情失败',
      message: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// 获取邮件的附件列表
app.get('/api/emails/:id/attachments', async (c) => {
  try {
    const id = c.req.param('id');
    const access = await emailAccess(c, id);
    if (access === 'notfound') {
      return c.json({ success: false, error: '邮件不存在' }, 404);
    }
    if (access === false) {
      return unauthorized(c);
    }
    
    // 获取附件列表
    const attachments = await getAttachments(c.env.DB, id);
    
    return c.json({ success: true, attachments });
  } catch (error) {
    console.error('获取附件列表失败:', error);
    return c.json({ 
      success: false, 
      error: '获取附件列表失败',
      message: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// 获取附件详情
app.get('/api/attachments/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const access = await attachmentAccess(c, id);
    if (access === 'notfound') {
      return c.json({ success: false, error: '附件不存在' }, 404);
    }
    if (access === false) {
      return unauthorized(c);
    }
    
    const attachment = await getAttachment(c.env.DB, id);
    
    if (!attachment) {
      return c.json({ success: false, error: '附件不存在' }, 404);
    }
    
    // 检查是否需要直接返回附件内容
    const download = c.req.query('download') === 'true';
    
    if (download) {
      // 将Base64内容转换为二进制
      const binaryContent = atob(attachment.content);
      const bytes = new Uint8Array(binaryContent.length);
      for (let i = 0; i < binaryContent.length; i++) {
        bytes[i] = binaryContent.charCodeAt(i);
      }
      
      // 设置响应头
      c.header('Content-Type', attachment.mimeType);
      c.header('Content-Disposition', `attachment; filename="${encodeURIComponent(attachment.filename)}"`);
      
      return c.body(bytes);
    }
    
    // 返回附件信息（不包含内容，避免响应过大）
    return c.json({ 
      success: true, 
      attachment: {
        id: attachment.id,
        emailId: attachment.emailId,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        size: attachment.size,
        createdAt: attachment.createdAt,
        isLarge: attachment.isLarge,
        chunksCount: attachment.chunksCount
      }
    });
  } catch (error) {
    console.error('获取附件详情失败:', error);
    return c.json({ 
      success: false, 
      error: '获取附件详情失败',
      message: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// AI 聊天
app.post('/api/chat', async (c) => {
  try {
    // 按 IP 限流：每个 IP 每小时最多 30 次，防止 AI 额度被陌生人刷
    const ip = c.req.header('CF-Connecting-IP') || 'unknown';
    const limited = await enforceRateLimit(c.env.DB, `ai-chat:${ip}`, 3600, 30);
    if (limited) {
      return c.json({ success: false, error: 'AI 请求过于频繁，请 1 小时后再试' }, 429);
    }

    const body = await c.req.json();
    const { message, history = [], systemPrompt, max_tokens } = body;

    if (!message?.trim()) {
      return c.json({ success: false, error: '消息不能为空' }, 400);
    }

    const messages = [
      { role: 'system', content: systemPrompt || '你是一个友好、聪明、有帮助的AI助手。请用中文回复用户的问题。' },
      ...history.slice(-12),
      { role: 'user', content: message }
    ];

    // 限制单次输出长度，避免被恶意拉长请求
    const requestedMaxTokens = Number(max_tokens);
    const safeMaxTokens = Number.isFinite(requestedMaxTokens)
      ? Math.min(Math.max(requestedMaxTokens, 1), 1200)
      : 800;

    const aiResponse = await c.env.AI.run(
      '@cf/meta/llama-4-scout-17b-16e-instruct',
      {
        messages,
        temperature: 0.75,
        max_tokens: safeMaxTokens,
        stream: true
      }
    );

    return new Response(aiResponse, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  } catch (error) {
    console.error('AI 调用错误:', error);
    return c.json({ success: false, error: '服务器内部错误' }, 500);
  }
});

// 删除邮件
app.delete('/api/emails/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const access = await emailAccess(c, id);
    if (access === 'notfound') {
      return c.json({ success: false, error: '邮件不存在' }, 404);
    }
    if (access === false) {
      return unauthorized(c);
    }
    await deleteEmail(c.env.DB, id);
    
    return c.json({ success: true });
  } catch (error) {
    console.error('删除邮件失败:', error);
    return c.json({ 
      success: false, 
      error: '删除邮件失败',
      message: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// 将邮件标记为未读
app.put('/api/emails/:id/unread', async (c) => {
  try {
    const id = c.req.param('id');
    const access = await emailAccess(c, id);
    if (access === 'notfound') {
      return c.json({ success: false, error: '邮件不存在' }, 404);
    }
    if (access === false) {
      return unauthorized(c);
    }
    await markEmailAsUnread(c.env.DB, id);
    
    return c.json({ success: true });
  } catch (error) {
    console.error('标记邮件为未读失败:', error);
    return c.json({ 
      success: false, 
      error: '标记邮件为未读失败',
      message: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// 批量删除邮件
app.post('/api/emails/batch/delete', async (c) => {
  try {
    const body = await c.req.json();
    const { emailIds } = body;
    
    if (!Array.isArray(emailIds) || emailIds.length === 0) {
      return c.json({ success: false, error: '请提供要删除的邮件ID列表' }, 400);
    }
    
    const access = await emailsBatchAccess(c, emailIds);
    if (access === 'notfound') {
      return c.json({ success: false, error: '邮件不存在' }, 404);
    }
    if (access === 'mixed') {
      return c.json({ success: false, error: '存在不属于当前邮箱的邮件' }, 403);
    }
    if (access === false) {
      return unauthorized(c);
    }
    
    await batchDeleteEmails(c.env.DB, emailIds);
    
    return c.json({ success: true });
  } catch (error) {
    console.error('批量删除邮件失败:', error);
    return c.json({ 
      success: false, 
      error: '批量删除邮件失败',
      message: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// 批量标记邮件为已读
app.post('/api/emails/batch/read', async (c) => {
  try {
    const body = await c.req.json();
    const { emailIds } = body;
    
    if (!Array.isArray(emailIds) || emailIds.length === 0) {
      return c.json({ success: false, error: '请提供要标记的邮件ID列表' }, 400);
    }
    
    const access = await emailsBatchAccess(c, emailIds);
    if (access === 'notfound') {
      return c.json({ success: false, error: '邮件不存在' }, 404);
    }
    if (access === 'mixed') {
      return c.json({ success: false, error: '存在不属于当前邮箱的邮件' }, 403);
    }
    if (access === false) {
      return unauthorized(c);
    }
    
    await batchMarkEmailsAsRead(c.env.DB, emailIds);
    
    return c.json({ success: true });
  } catch (error) {
    console.error('批量标记邮件为已读失败:', error);
    return c.json({ 
      success: false, 
      error: '批量标记邮件为已读失败',
      message: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// 批量标记邮件为未读
app.post('/api/emails/batch/unread', async (c) => {
  try {
    const body = await c.req.json();
    const { emailIds } = body;
    
    if (!Array.isArray(emailIds) || emailIds.length === 0) {
      return c.json({ success: false, error: '请提供要标记的邮件ID列表' }, 400);
    }
    
    const access = await emailsBatchAccess(c, emailIds);
    if (access === 'notfound') {
      return c.json({ success: false, error: '邮件不存在' }, 404);
    }
    if (access === 'mixed') {
      return c.json({ success: false, error: '存在不属于当前邮箱的邮件' }, 403);
    }
    if (access === false) {
      return unauthorized(c);
    }
    
    await batchMarkEmailsAsUnread(c.env.DB, emailIds);
    
    return c.json({ success: true });
  } catch (error) {
    console.error('批量标记邮件为未读失败:', error);
    return c.json({ 
      success: false, 
      error: '批量标记邮件为未读失败',
      message: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// ============================================================================
// 加密管理接口（需 X-Migration-Secret 或 MIGRATION_SECRET，未配置则禁用）
// ============================================================================
function checkMigrationSecret(c: AuthenticatedContext): boolean {
  const expected = c.env.MIGRATION_SECRET || '';
  if (!expected) return false;
  const provided = c.req.header('X-Migration-Secret') || '';
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

// 查看加密是否启用、还有多少历史明文数据待迁移
app.get('/api/admin/encryption/status', async (c) => {
  if (!checkMigrationSecret(c)) {
    return c.json({ success: false, error: 'unauthorized' }, 401);
  }
  try {
    const status = await getEncryptionStatus(c.env.DB);
    return c.json({ success: true, ...status });
  } catch (error) {
    console.error('获取加密状态失败:', error);
    return c.json({
      success: false,
      error: '获取加密状态失败',
      message: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// 分批加密历史明文数据（每类默认 20 条，最大 50 条，避免 Worker CPU 超时）
app.post('/api/admin/encryption/migrate', async (c) => {
  if (!checkMigrationSecret(c)) {
    return c.json({ success: false, error: 'unauthorized' }, 401);
  }
  try {
    let limit = 20;
    try {
      const body = await c.req.json();
      if (typeof body?.limit === 'number') limit = body.limit;
    } catch {
      // 无请求体时使用默认值
    }
    const result = await encryptLegacyBatch(c.env.DB, limit);
    const status = await getEncryptionStatus(c.env.DB);
    return c.json({ success: true, migrated: result, remaining: status.pending });
  } catch (error) {
    console.error('加密迁移失败:', error);
    return c.json({
      success: false,
      error: '加密迁移失败',
      message: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

export default app;
