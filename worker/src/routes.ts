import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Env} from './types';
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
  getMailboxCountByIpLast24h
} from './database';
import { generateRandomAddress, generatePassword } from './utils';

// 创建 Hono 应用
const app = new Hono<{ Bindings: Env }>();

// 添加 CORS 中间件
app.use('/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
  maxAge: 86400,
}));

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
    
    // 生成或使用提供的地址
    const address = body.address || generateRandomAddress();
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
    
    return c.json({ success: true, mailbox, password });
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
    
    return c.json({ success: true, mailbox });
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
      return c.json({ success: false, error: '邮箱地址或密码错误' }, 401);
    }
    
    return c.json({ success: true, mailbox });
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
    const mailbox = await getMailbox(c.env.DB, address);
    
    if (!mailbox) {
      return c.json({ success: false, error: '邮箱不存在' }, 404);
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

// 获取邮件详情
app.get('/api/emails/:id', async (c) => {
  try {
    const id = c.req.param('id');
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
    
    // 检查邮件是否存在
    const email = await getEmail(c.env.DB, id);
    if (!email) {
      return c.json({ success: false, error: '邮件不存在' }, 404);
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

    const aiResponse = await c.env.AI.run(
      '@cf/meta/llama-4-scout-17b-16e-instruct',
      {
        messages,
        temperature: 0.75,
        max_tokens: max_tokens || 800,
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

export default app;