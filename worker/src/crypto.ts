/**
 * 应用层加密工具（D1 静态数据保护）
 *
 * 设计目标：
 * 1. 即使攻击者拿到 D1 数据库导出文件（或 Cloudflare 账号被只读入侵），
 *    也无法直接看到邮箱地址、邮件正文、附件内容、站内聊天内容。
 * 2. 邮箱地址需要支持等值查询，因此采用“确定性加密 + HMAC 盲索引”：
 *    - 数据库保存密文（encd:v2:...）
 *    - 另存 HMAC 盲索引（bidx:v2:...）用于 WHERE 查询
 *    - 同一个地址始终得到相同密文/索引，但不知道密钥无法还原
 * 3. 其它内容字段使用随机 IV 的 AES-256-GCM，防止相同内容被识别。
 *
 * 密钥只放在 Worker Secret（MAIL_ENCRYPTION_KEY），不写入 D1、不写入代码仓库。
 * 注意：密钥丢失后数据不可恢复，请务必备份密钥；当前版本不支持在线轮换密钥。
 *
 * 密钥版本：
 * - v1：历史版本，AES/HMAC 密钥 = SHA-256(固定前缀 + 主密钥)
 * - v2：当前版本，AES/HMAC 密钥由 PBKDF2-SHA256（100000 次迭代，固定盐）派生，
 *       并用 512 位输出拆分为 AES 密钥和 HMAC 密钥。
 * 读取时同时兼容 v1/v2；新写入一律使用 v2。历史 v1 数据由迁移接口重新加密为 v2。
 */

// v1：历史密文格式（继续支持读取）
const TEXT_PREFIX_V1 = 'enc:v1:';
const ADDRESS_PREFIX_V1 = 'encd:v1:';
const INDEX_PREFIX_V1 = 'bidx:v1:';

// v2：当前密文格式（新写入）
const TEXT_PREFIX_V2 = 'enc:v2:';
const ADDRESS_PREFIX_V2 = 'encd:v2:';
const INDEX_PREFIX_V2 = 'bidx:v2:';

// 限流键哈希（rate_events.ip 中使用，避免泄露邮箱地址/IP 明文）
const RATE_KEY_PREFIX = 'ridx:v1:';

const MIN_SECRET_LENGTH = 16;
const V2_PBKDF2_ITERATIONS = 100000;
const V2_DERIVATION_SALT = 'miaoyou:d1:key-derivation:v2';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

let masterSecret = '';
let warnedMissingKey = false;
let warnedWeakKey = false;
let v2KeysPromise: Promise<{ aes: CryptoKey; hmac: CryptoKey }> | null = null;

/** 设置当前 isolate 使用的加密密钥（由 index.ts / email-handler.ts 在请求入口调用） */
export function configureEncryption(secret?: string): void {
  const value = (secret || '').trim();

  // 密钥变化时清空派生缓存，避免继续使用旧密钥
  if (value !== masterSecret) {
    masterSecret = value;
    v2KeysPromise = null;
  }

  if (!isEncryptionEnabled() && !warnedMissingKey) {
    warnedMissingKey = true;
    console.warn(
      '[crypto] 未配置 MAIL_ENCRYPTION_KEY 或长度不足 16 字符：敏感字段将以明文写入 D1。' +
      '生产环境请执行 `wrangler secret put MAIL_ENCRYPTION_KEY` 配置密钥。'
    );
  } else if (isEncryptionEnabled() && masterSecret.length < 32 && !warnedWeakKey) {
    warnedWeakKey = true;
    console.warn(
      '[crypto] MAIL_ENCRYPTION_KEY 长度不足 32 字符：虽然已启用 PBKDF2 派生，' +
      '仍建议使用 `openssl rand -base64 32` 生成的高熵密钥。'
    );
  }
}

/** 是否启用了加密 */
export function isEncryptionEnabled(): boolean {
  return masterSecret.length >= MIN_SECRET_LENGTH;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** v1：由主密钥派生 AES-256-GCM 密钥（仅用于读取历史密文） */
async function getAesKeyV1(usage: 'encrypt' | 'decrypt'): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(`miaoyou:aes-gcm:v1:${masterSecret}`)
  );
  return crypto.subtle.importKey(
    'raw',
    digest,
    { name: 'AES-GCM' },
    false,
    [usage]
  );
}

/** v1：由主密钥派生 HMAC-SHA256 密钥（仅用于读取历史盲索引） */
async function getHmacKeyV1(): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(`miaoyou:hmac:v1:${masterSecret}`)
  );
  return crypto.subtle.importKey(
    'raw',
    digest,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

/**
 * v2：用 PBKDF2-SHA256 派生一组密钥。
 * 512 位输出前 32 字节作为 AES-256 密钥，后 32 字节作为 HMAC-SHA256 密钥。
 * 结果按 isolate 缓存，密钥变化时由 configureEncryption 清空。
 */
async function getV2Keys(): Promise<{ aes: CryptoKey; hmac: CryptoKey }> {
  if (!v2KeysPromise) {
    v2KeysPromise = (async () => {
      const baseKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(masterSecret),
        'PBKDF2',
        false,
        ['deriveBits']
      );
      const derived = await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt: encoder.encode(V2_DERIVATION_SALT),
          iterations: V2_PBKDF2_ITERATIONS,
          hash: 'SHA-256',
        },
        baseKey,
        512
      );

      const aes = await crypto.subtle.importKey(
        'raw',
        derived.slice(0, 32),
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
      );
      const hmac = await crypto.subtle.importKey(
        'raw',
        derived.slice(32, 64),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      return { aes, hmac };
    })().catch(error => {
      // 派生失败时允许下一次请求重试
      v2KeysPromise = null;
      throw error;
    });
  }
  return v2KeysPromise;
}

async function hmacV1(value: string): Promise<Uint8Array> {
  const key = await getHmacKeyV1();
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return new Uint8Array(signature);
}

async function hmacV2(value: string): Promise<Uint8Array> {
  const { hmac } = await getV2Keys();
  const signature = await crypto.subtle.sign('HMAC', hmac, encoder.encode(value));
  return new Uint8Array(signature);
}

/** 是否已经是加密文本（兼容 v1/v2） */
export function isEncryptedText(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    (value.startsWith(TEXT_PREFIX_V1) || value.startsWith(TEXT_PREFIX_V2))
  );
}

/** 是否已经是加密地址（兼容 v1/v2） */
export function isEncryptedAddress(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    (value.startsWith(ADDRESS_PREFIX_V1) || value.startsWith(ADDRESS_PREFIX_V2))
  );
}

/**
 * 加密任意文本（AES-256-GCM，随机 IV）
 * 空字符串保持为空，避免无意义写入。
 */
export async function encryptText(plaintext: string | null | undefined): Promise<string> {
  if (plaintext === null || plaintext === undefined) return '';
  if (!isEncryptionEnabled() || plaintext === '' || isEncryptedText(plaintext)) {
    return plaintext;
  }

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const { aes } = await getV2Keys();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    aes,
    encoder.encode(plaintext)
  );

  return `${TEXT_PREFIX_V2}${toBase64(iv)}:${toBase64(new Uint8Array(ciphertext))}`;
}

/**
 * 解密文本；对历史明文数据直接原样返回（向后兼容）。
 * 同时兼容 v1 和 v2 两种密文格式。
 */
export async function decryptText(value: string | null | undefined): Promise<string> {
  if (value === null || value === undefined || value === '') return '';
  if (!isEncryptedText(value)) return value;

  if (!isEncryptionEnabled()) {
    return '[已加密数据：请在 Worker 配置 MAIL_ENCRYPTION_KEY 后查看]';
  }

  const isV2 = value.startsWith(TEXT_PREFIX_V2);
  const prefix = isV2 ? TEXT_PREFIX_V2 : TEXT_PREFIX_V1;

  try {
    const body = value.slice(prefix.length);
    const sep = body.indexOf(':');
    if (sep < 0) return value;
    const iv = fromBase64(body.slice(0, sep));
    const ciphertext = fromBase64(body.slice(sep + 1));
    const key = isV2 ? (await getV2Keys()).aes : await getAesKeyV1('decrypt');
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
      key,
      ciphertext.buffer as ArrayBuffer
    );
    return decoder.decode(plaintext);
  } catch (error) {
    console.error('[crypto] 文本解密失败:', error);
    return '[解密失败：密钥可能已变更]';
  }
}

/**
 * 确定性加密邮箱地址（AES-256-GCM，IV 由 HMAC 派生）
 * 相同地址得到相同密文，便于数据库等值查询；没有密钥无法还原。
 */
export async function encryptAddress(address: string): Promise<string> {
  const normalized = normalizeAddress(address);
  if (!isEncryptionEnabled() || normalized === '' || isEncryptedAddress(normalized)) {
    return normalized;
  }

  const ivSource = await hmacV2(`address-iv:${normalized}`);
  const iv = ivSource.slice(0, 12);
  const { aes } = await getV2Keys();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    aes,
    encoder.encode(normalized)
  );

  return `${ADDRESS_PREFIX_V2}${toBase64(iv)}:${toBase64(new Uint8Array(ciphertext))}`;
}

/**
 * 解密邮箱地址；历史明文直接返回。
 * 同时兼容 v1 和 v2 两种密文格式。
 */
export async function decryptAddress(value: string | null | undefined): Promise<string> {
  if (value === null || value === undefined || value === '') return '';
  if (!isEncryptedAddress(value)) return normalizeAddress(value);

  if (!isEncryptionEnabled()) {
    return '[已加密邮箱：请在 Worker 配置 MAIL_ENCRYPTION_KEY 后查看]';
  }

  const isV2 = value.startsWith(ADDRESS_PREFIX_V2);
  const prefix = isV2 ? ADDRESS_PREFIX_V2 : ADDRESS_PREFIX_V1;

  try {
    const body = value.slice(prefix.length);
    const sep = body.indexOf(':');
    if (sep < 0) return value;
    const iv = fromBase64(body.slice(0, sep));
    const ciphertext = fromBase64(body.slice(sep + 1));
    const key = isV2 ? (await getV2Keys()).aes : await getAesKeyV1('decrypt');
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
      key,
      ciphertext.buffer as ArrayBuffer
    );
    return normalizeAddress(decoder.decode(plaintext));
  } catch (error) {
    console.error('[crypto] 地址解密失败:', error);
    return '[解密失败：密钥可能已变更]';
  }
}

/**
 * 邮箱地址盲索引（v2，HMAC-SHA256）
 * 用于 WHERE address_hash = ? 查询，数据库里看不到原始地址。
 */
export async function blindIndexAddress(address: string): Promise<string> {
  const normalized = normalizeAddress(address);
  if (!isEncryptionEnabled() || normalized === '') return normalized;
  return `${INDEX_PREFIX_V2}${toHex(await hmacV2(`address:${normalized}`))}`;
}

/**
 * 历史 v1 盲索引，仅用于查询升级前写入的数据。
 * 新数据不再使用该格式，迁移完成后可逐步淘汰。
 */
export async function legacyBlindIndexAddress(address: string): Promise<string> {
  const normalized = normalizeAddress(address);
  if (!isEncryptionEnabled() || normalized === '') return normalized;
  return `${INDEX_PREFIX_V1}${toHex(await hmacV1(`address:${normalized}`))}`;
}

/**
 * 同时返回 v2 与 v1 盲索引，查询时用 IN (?, ?) 兼容新旧数据。
 * 未启用加密时返回两个相同的明文地址，保持 SQL 占位符数量稳定。
 */
export async function addressHashVariants(address: string): Promise<[string, string]> {
  const normalized = normalizeAddress(address);
  if (!isEncryptionEnabled() || normalized === '') {
    return [normalized, normalized];
  }
  const [current, legacy] = await Promise.all([
    blindIndexAddress(normalized),
    legacyBlindIndexAddress(normalized),
  ]);
  return [current, legacy];
}

/**
 * 对限流键做 HMAC 后写入 rate_events.ip。
 * 这样 rate_events 中不再出现 "send:user@example.com" 这类明文地址。
 */
export async function hashRateLimitKey(key: string): Promise<string> {
  if (!isEncryptionEnabled() || key === '') return key;
  return `${RATE_KEY_PREFIX}${toHex(await hmacV2(`rate-limit:${key}`))}`;
}

/** 规范化邮箱地址：去空白并统一小写 */
export function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

/**
 * 同时返回地址的密文和盲索引，减少重复 HMAC 计算。
 */
export async function protectAddress(address: string): Promise<{ value: string; hash: string; plain: string }> {
  const plain = normalizeAddress(address);
  const [value, hash] = await Promise.all([encryptAddress(plain), blindIndexAddress(plain)]);
  return { value, hash, plain };
}
