import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import Container from './Container';
import { getAnnouncement, type AnnouncementData } from '../utils/api';

// 关闭状态按「公告 ID + 更新时间」记录：管理页更新公告后会自动重新展示
const DISMISS_STORAGE_KEY = 'miaoyou_announcement_dismissed';

const LEVEL_STYLES: Record<string, string> = {
  info: 'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200',
  success: 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200',
  warning: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200',
  important: 'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200'
};

const LEVEL_ICONS: Record<string, string> = {
  info: 'fa-bullhorn',
  success: 'fa-circle-check',
  warning: 'fa-triangle-exclamation',
  important: 'fa-circle-exclamation'
};

const readDismissed = (): string => {
  try {
    return localStorage.getItem(DISMISS_STORAGE_KEY) || '';
  } catch {
    return '';
  }
};

const AnnouncementBanner: React.FC = () => {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const [announcement, setAnnouncement] = useState<AnnouncementData | null>(null);
  const [visible, setVisible] = useState(false);
  const isAdminPage = location.pathname.startsWith('/admin');

  useEffect(() => {
    if (isAdminPage) return;
    let cancelled = false;

    getAnnouncement().then((result) => {
      if (cancelled || !result.success || !result.announcement) return;
      const item = result.announcement;
      if (readDismissed() === `${item.id}:${item.updatedAt}`) return;
      setAnnouncement(item);
      setVisible(true);
    });

    return () => {
      cancelled = true;
    };
  }, [isAdminPage]);

  if (isAdminPage || !visible || !announcement) return null;

  const isZh = (i18n.language || '').toLowerCase().startsWith('zh');
  const title = (isZh ? announcement.title : announcement.titleEn || '').trim() || announcement.title;
  const content = (isZh ? announcement.content : announcement.contentEn || '').trim() || announcement.content;
  const level = announcement.level in LEVEL_STYLES ? announcement.level : 'info';

  const handleClose = () => {
    try {
      localStorage.setItem(DISMISS_STORAGE_KEY, `${announcement.id}:${announcement.updatedAt}`);
    } catch {
      // localStorage 不可用时只关闭当前页面显示
    }
    setVisible(false);
  };

  return (
    <div className={`announcement-breathing border-b ${LEVEL_STYLES[level]}`} role="status">
      <Container>
        <div className="flex items-start gap-3 py-3">
          <i className={`fas ${LEVEL_ICONS[level]} mt-1 shrink-0`} aria-hidden="true"></i>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold break-words">{title}</p>
            <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap break-words opacity-90">{content}</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="shrink-0 rounded p-1 opacity-70 transition-opacity hover:opacity-100"
            title={t('common.close', '关闭')}
            aria-label={t('common.close', '关闭')}
          >
            <i className="fas fa-xmark" aria-hidden="true"></i>
          </button>
        </div>
      </Container>
    </div>
  );
};

export default AnnouncementBanner;
