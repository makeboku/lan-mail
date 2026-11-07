// 浏览器本地敏感数据的加密存储工具。
// 密钥保存在 IndexedDB 的「不可导出」CryptoKey 中，localStorage 只保存 AES-GCM 密文，
// 这样打开 F12 或浏览器同步 localStorage 时都看不到密码明文。
// 注意：这不能防御同源 XSS，只能防止“控制台直接查看 / localStorage 被同步”层面的泄露。

const DB_NAME = 'miaoyou-local-secure';
const DB_VERSION = 1;
const STORE_NAME = 'keys';
const KEY_ID = 'local-data-key';
const PREFIX = 'v1:';

let cachedKey: CryptoKey | null = null;

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const getKey = async (): Promise<CryptoKey> => {
  if (cachedKey) return cachedKey;

  const db = await openDb();
  try {
    const existing = await new Promise<CryptoKey | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(KEY_ID);
      request.onsuccess = () => resolve(request.result as CryptoKey | undefined);
      request.onerror = () => reject(request.error);
    });

    if (existing) {
      cachedKey = existing;
      return existing;
    }

    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false, // 不可导出，脚本无法读出原始密钥
      ['encrypt', 'decrypt']
    );

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(key, KEY_ID);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });

    cachedKey = key;
    return key;
  } finally {
    db.close();
  }
};

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const fromBase64 = (value: string): Uint8Array => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

export const encryptString = async (plain: string): Promise<string> => {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain))
  );
  const packed = new Uint8Array(iv.length + cipher.length);
  packed.set(iv, 0);
  packed.set(cipher, iv.length);
  return PREFIX + toBase64(packed);
};

export const decryptString = async (payload: string): Promise<string> => {
  if (!payload.startsWith(PREFIX)) throw new Error('Unsupported payload');
  const key = await getKey();
  const packed = fromBase64(payload.slice(PREFIX.length));
  const iv = packed.slice(0, 12);
  const cipher = packed.slice(12);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  return new TextDecoder().decode(plain);
};

// 写入加密 JSON；失败时不会退回明文写入
export const setEncryptedItem = async (key: string, value: unknown): Promise<boolean> => {
  try {
    localStorage.setItem(key, await encryptString(JSON.stringify(value)));
    return true;
  } catch (error) {
    console.error(`保存加密数据失败: ${key}`, error);
    return false;
  }
};

// 读取加密 JSON，并自动把旧版明文数据升级为密文
export const getEncryptedItem = async <T>(key: string): Promise<T | null> => {
  const raw = localStorage.getItem(key);
  if (!raw) return null;

  if (raw.startsWith(PREFIX)) {
    try {
      return JSON.parse(await decryptString(raw)) as T;
    } catch (error) {
      console.error(`读取加密数据失败: ${key}`, error);
      localStorage.removeItem(key);
      return null;
    }
  }

  // 兼容旧版本的明文 JSON：读取后立即升级为密文
  try {
    const legacy = JSON.parse(raw) as T;
    const saved = await setEncryptedItem(key, legacy);
    if (!saved) localStorage.removeItem(key);
    return legacy;
  } catch (error) {
    console.error(`清理损坏的本地数据失败: ${key}`, error);
    localStorage.removeItem(key);
    return null;
  }
};
