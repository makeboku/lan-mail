import { API_BASE_URL } from "../config";

// API请求基础URL
const apiUrl = (path: string) => `${API_BASE_URL}${path}`;

// 创建随机邮箱
export const createRandomMailbox = async (expiresInHours = 876000) => {
  try {
    const requestBody = JSON.stringify({
      expiresInHours,
    });
    
    const response = await fetch(apiUrl('/api/mailboxes'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: requestBody,
    });
    
    if (!response.ok) {
      throw new Error('Failed to create mailbox');
    }
    
    const data = await response.json();
    
    if (data.success) {
      return { success: true, mailbox: data.mailbox, password: data.password };
    } else {
      throw new Error(data.error || 'Unknown error');
    }
  } catch (error) {
    return { success: false, error };
  }
};

// 使用指定的用户名和密码创建邮箱
export const createMailboxWithCredentials = async (address: string, password: string, expiresInHours = 876000) => {
  try {
    const response = await fetch(apiUrl('/api/mailboxes'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        address: address.trim(),
        password: password.trim(),
        expiresInHours,
      }),
    });
    
    // 尝试解析 JSON，防止服务器返回 HTML 错误页导致崩溃
    let data;
    try {
      data = await response.json();
    } catch {
      return { success: false, error: `服务器响应错误 (${response.status})` };
    }
    
    // 统一处理非 200 状态码
    if (!response.ok) {
      // 优先使用后端返回的中文错误信息（如 IP 限制提示）
      return { success: false, error: data.error || `创建失败 (${response.status})` };
    }
    
    if (data.success) {
      return { success: true, mailbox: data.mailbox, password: data.password || password };
    } else {
      throw new Error(data.error || '未知错误');
    }
  } catch (error) {
    console.error('Error creating mailbox with credentials:', error);
    // 确保返回的 error 是字符串
    const message = error instanceof Error ? error.message : '网络异常';
    return { success: false, error: message };
  }
};

// 创建自定义邮箱
export const createCustomMailbox = async (address: string, expiresInHours = 876000) => {
  try {
    if (!address.trim()) {
      return { success: false, error: 'Invalid address' };
    }
    
    const response = await fetch(apiUrl('/api/mailboxes'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        address: address.trim(),
        expiresInHours,
      }),
    });
    
    // 尝试解析响应内容
    const data = await response.json();
    
    if (!response.ok) {
      if (response.status === 400) {
        // 使用后端返回的错误信息
        return { success: false, error: data.error || 'Address already exists' };
      }
      throw new Error(data.error || 'Failed to create mailbox');
    }
    
    if (data.success) {
      return { success: true, mailbox: data.mailbox, password: data.password };
    } else {
      throw new Error(data.error || 'Unknown error');
    }
  } catch (error) {
    console.error('Error creating custom mailbox:', error);
    return { success: false, error };
  }
};

// 获取邮箱信息
export const getMailbox = async (address: string) => {
  try {
    const response = await fetch(apiUrl(`/api/mailboxes/${address}`));
    
    if (!response.ok) {
      if (response.status === 404) {
        return { success: false, error: 'Mailbox not found' };
      }
      throw new Error('Failed to fetch mailbox');
    }
    
    const data = await response.json();
    if (data.success) {
      return { success: true, mailbox: data.mailbox };
    } else {
      throw new Error(data.error || 'Unknown error');
    }
  } catch (error) {
    console.error('Error fetching mailbox:', error);
    return { success: false, error };
  }
};

// 获取邮件列表
export const getEmails = async (address: string) => {
  try {
    // 检查地址是否为空
    if (!address) {
      return { success: false, error: 'Address is empty', emails: [] };
    }
    
    const response = await fetch(apiUrl(`/api/mailboxes/${address}/emails`));
    
    // 直接处理404状态码
    if (response.status === 404) {
      return { success: false, error: 'Mailbox not found', notFound: true };
    }
    
    if (!response.ok) {
      throw new Error(`Failed to fetch emails: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      return { success: true, emails: data.emails };
    } else {
      // 检查错误信息是否包含"邮箱不存在"
      if (data.error && (data.error.includes('邮箱不存在') || data.error.includes('Mailbox not found'))) {
        return { success: false, error: data.error, notFound: true };
      }
      throw new Error(data.error || 'Unknown error');
    }
  } catch (error) {
    return { success: false, error, emails: [] };
  }
};

// 删除邮箱
export const deleteMailbox = async (address: string) => {
  try {
    const response = await fetch(apiUrl(`/api/mailboxes/${address}`), {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      throw new Error('Failed to delete mailbox');
    }
    
    const data = await response.json();
    if (data.success) {
      return { success: true };
    } else {
      throw new Error(data.error || 'Unknown error');
    }
  } catch (error) {
    console.error('Error deleting mailbox:', error);
    return { success: false, error };
  }
};

// 保存邮箱信息到本地存储
export const saveMailboxToLocalStorage = (mailbox: Mailbox, password: string) => {
  localStorage.setItem('tempMailbox', JSON.stringify({
    ...mailbox,
    password,
    savedAt: Date.now() / 1000
  }));
};

// 从本地存储获取邮箱信息
export const getMailboxFromLocalStorage = (): (Mailbox & { password: string }) | null => {
  const savedMailbox = localStorage.getItem('tempMailbox');
  if (!savedMailbox) return null;
  
  try {
    const mailbox = JSON.parse(savedMailbox) as Mailbox & { password: string; savedAt: number };
    
    return mailbox;
  } catch (error) {
    localStorage.removeItem('tempMailbox');
    return null;
  }
};

// 登录邮箱
export const loginMailbox = async (address: string, password: string) => {
  try {
    const response = await fetch(apiUrl('/api/mailboxes/login'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ address, password }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      if (response.status === 401) {
        return { success: false, error: data.error || '邮箱地址或密码错误' };
      }
      throw new Error(data.error || '登录失败');
    }
    
    if (data.success) {
      return { success: true, mailbox: data.mailbox, password };
    } else {
      throw new Error(data.error || '未知错误');
    }
  } catch (error) {
    console.error('Error logging in:', error);
    const message = error instanceof Error ? error.message : '登录失败';
    return { success: false, error: message };
  }
};

// 从本地存储删除邮箱信息
export const removeMailboxFromLocalStorage = () => {
  localStorage.removeItem('tempMailbox');
};

// 获取系统统计信息
export const getStats = async (): Promise<{ success: boolean; stats?: { mailboxCount: number }; error?: any }> => {
  try {
    const response = await fetch(apiUrl('/api/stats'));
    
    if (!response.ok) {
      throw new Error('Failed to fetch stats');
    }
    
    const data = await response.json();
    
    if (data.success) {
      return { success: true, stats: data.stats };
    } else {
      throw new Error(data.error || 'Unknown error');
    }
  } catch (error) {
    console.error('Error fetching stats:', error);
    return { success: false, error };
  }
}; 