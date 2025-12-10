import React from 'react';
import { X } from 'lucide-react';
import '../styles/ConfirmationModal.css';
import { useSelector } from 'react-redux';
import { RootState } from '../store/store';
import { translations } from '../translations';

interface ConfirmationModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
    isOpen,
    title,
    message,
    onConfirm,
    onCancel
}) => {
    const { currentLang: lang } = useSelector((state: RootState) => state.language);
    
    // Simple helper to get translation
    const t = (key: string) => {
        return (translations[lang]?.[key] ?? key).toString();
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onCancel}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3 className="modal-title">{title}</h3>
                    <button 
                        className="modal-close" 
                        onClick={onCancel}
                        title={t('close')}
                    >
                        <X size={20} />
                    </button>
                </div>
                <div className="modal-body">
                    {message}
                </div>
                <div className="modal-footer">
                    <button 
                        className="btn-cancel" 
                        onClick={onCancel}
                    >
                        {t('cancel')}
                    </button>
                    <button 
                        className="btn-confirm" 
                        onClick={onConfirm}
                    >
                        {t('confirm')}
                    </button>
                </div>
            </div>
        </div>
    );
};
