import * as PostalMimeModule from 'postal-mime';
import { Env, ParsedEmail } from './types';
import { getMailbox, saveEmail, saveAttachment } from './database';
import { configureEncryption } from './crypto';

const PostalMime = PostalMimeModule.default;

/**
 * 处理接收到的邮件
 * @param message 邮件消息
 * @param env 环境变量
 */
export async function handleEmail(message: any, env: Env): Promise<void> {
  configureEncryption(env.MAIL_ENCRYPTION_KEY);
  try {
    const parser = new PostalMime();
    const email = await parser.parse(message.raw) as ParsedEmail;

    // [security] 不打印主题/收发件人等明文，避免 Workers Logs / wrangler tail 泄露已加密内容
    console.log('邮件解析结果:', {
      hasSubject: !!email.subject,
      hasHtml: !!email.html,
      hasText: !!email.text,
      attachmentsCount: email.attachments?.length || 0
    });

    // 提取完整邮箱地址
    const mailboxAddress = email.to[0].address;
    
    console.log('开始查找目标邮箱');
    
    // 查找对应的邮箱（不检查过期时间）
    const mailbox = await getMailbox(env.DB, mailboxAddress);
    
    if (!mailbox) {
      console.log('邮箱不存在');
      throw new Error('邮箱不存在');
    }

    // 保存邮件（收到的 HTML 先做基础净化，移除脚本/事件绑定/javascript:，防存储型XSS）
    const savedEmail = await saveEmail(env.DB, {
      mailboxId: mailbox.id,
      fromAddress: email.from.address,
      fromName: email.from.name || '',
      toAddress: mailboxAddress,
      subject: email.subject || '',
      textContent: email.text || '',
      htmlContent: sanitizeHtml(email.html || ''),
      hasAttachments: !!email.attachments?.length,
    });

    // 保存附件（如果有）
    if (email.attachments && email.attachments.length > 0) {
      console.log(`开始保存 ${email.attachments.length} 个附件`);
      
      for (const attachment of email.attachments) {
        try {
          // 将 ArrayBuffer 转换为 Base64 字符串
          const base64Content = arrayBufferToBase64(attachment.content);
          
          // 计算附件大小（字节）
          const size = attachment.size || attachment.content.byteLength;
          
          // 保存附件
          await saveAttachment(env.DB, {
            emailId: savedEmail.id,
            filename: attachment.filename,
            mimeType: attachment.mimeType,
            content: base64Content,
            size: size
          });
          
          console.log('附件保存成功');
        } catch (attachmentError) {
          console.error('保存附件失败:', attachmentError);
          // 继续处理其他附件，不中断流程
        }
      }
    }
  } catch (error) {
    console.error('处理邮件失败:', error);
  }
}

/**
 * 将 ArrayBuffer 转换为 Base64 字符串
 * @param buffer ArrayBuffer 数据
 * @returns Base64 字符串
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * 基础 HTML 净化：移除 <script>、事件绑定属性(on*)、javascript: 协议链接，防存储型XSS
 * @param html 原始 HTML
 * @returns 净化后的 HTML
 */
function sanitizeHtml(html: string): string {
  return html
    // 移除 <script>...</script> 及其自闭合形式
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script\b[^>]*\/>/gi, '')
    // 移除事件绑定属性 on*=...
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    // 移除 javascript: 协议的链接
    .replace(/(href|src|action)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1=$2$2')
    // 移除 <iframe>（可嵌入脚本/钓鱼页面）
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe\s*>/gi, '')
    .replace(/<iframe\b[^>]*\/>/gi, '');
}