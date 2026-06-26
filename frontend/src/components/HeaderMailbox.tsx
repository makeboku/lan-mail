import React, { useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { MailboxContext } from '../contexts/MailboxContext';
import MailboxSwitcher from './MailboxSwitcher';

interface HeaderMailboxProps {
  mailbox: Mailbox | null;
  onMailboxChange: (mailbox: Mailbox) => void;
  isLoading: boolean;
}

const HeaderMailbox: React.FC<HeaderMailboxProps> = ({ 
  mailbox, 
  onMailboxChange,
  isLoading
}) => {
  const { t } = useTranslation();
  const { showSuccessMessage, showErrorMessage, mailbox: currentMailbox, setShowPasswordDialog, selectedDomain, logout, deleteMailbox } = useContext(MailboxContext);

  const fullAddress = mailbox ? (mailbox.address.includes('@') ? mailbox.address : `${mailbox.address}@${selectedDomain}`) : '';

  const copyToClipboard = () => {
    navigator.clipboard.writeText(fullAddress)
      .then(() => showSuccessMessage(t('mailbox.copySuccess')))
      .catch(() => showErrorMessage(t('mailbox.copyFailed')));
  };

  const copyPassword = () => {
    if (currentMailbox?.password) {
      navigator.clipboard.writeText(currentMailbox.password)
        .then(() => showSuccessMessage(t('mailbox.copyPasswordSuccess')))
        .catch(() => showErrorMessage(t('mailbox.copyPasswordFailed')));
    }
  };

  const handleCreateNew = () => {
    setShowPasswordDialog(true);
  };

  const handleDeleteMailbox = async () => {
    if (window.confirm(t('mailbox.confirmDelete'))) {
      await deleteMailbox();
    }
  };

  return (
    <>
      <div className="flex items-center space-x-1">
        <MailboxSwitcher
          currentMailbox={mailbox}
          onSwitchMailbox={(m) => onMailboxChange(m)}
          domain={selectedDomain}
        />
        {!mailbox || isLoading ? (
          <button
            onClick={() => setShowPasswordDialog(true)}
            className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 transition-all font-medium shadow-sm"
          >
            <i className="fas fa-envelope mr-2"></i>
            {t('mailbox.login')} / {t('mailbox.create')}
          </button>
        ) : (
          <>
            <code className="hidden md:block bg-muted px-3 py-1.5 rounded-lg text-sm font-mono font-medium border">
              {fullAddress}
            </code>
        
            <button onClick={copyToClipboard} className="w-10 h-10 flex items-center justify-center rounded-lg text-primary hover:bg-primary/15 hover:text-primary transition-all" title={t('mailbox.copyMailbox')}>
              <i className="fas fa-copy text-base"></i>
            </button>
        
            <button onClick={copyPassword} className="w-10 h-10 flex items-center justify-center rounded-lg text-amber-500 hover:bg-amber-500/15 hover:text-amber-500 transition-all" title={t('mailbox.copyPassword')}>
              <i className="fas fa-key text-base"></i>
            </button>
        
            <button onClick={handleCreateNew} className="w-10 h-10 flex items-center justify-center rounded-lg text-emerald-500 hover:bg-emerald-500/15 hover:text-emerald-500 transition-all" title={t('mailbox.createNew')}>
              <i className="fas fa-plus text-base"></i>
            </button>
        
            <button onClick={logout} className="w-10 h-10 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-primary/15 hover:text-primary transition-all" title={t('mailbox.logout')}>
              <i className="fas fa-sign-out-alt text-base"></i>
            </button>
            <button onClick={handleDeleteMailbox} className="w-10 h-10 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-500/15 hover:text-red-500 transition-all" title={t('mailbox.delete')}>
              <i className="fas fa-trash-alt text-base"></i>
            </button>
          </>
        )}
      </div>

    </>
  );
};

export default HeaderMailbox;
