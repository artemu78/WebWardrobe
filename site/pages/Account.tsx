import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '../store/store';
import { fetchGenerations, deleteGeneration } from '../store/generationsSlice';
import { deleteSelfie, uploadSelfie } from '../store/userProfileSlice';
import { Trash2, Download, ExternalLink, Loader2, Upload, Plus } from 'lucide-react';
import '../styles/Account.css';
import { ConfirmationModal } from '../components/ConfirmationModal.tsx';
import { translations } from '../translations';

const Account: React.FC = () => {
    const dispatch = useDispatch<AppDispatch>();
    const { user, status: userStatus } = useSelector((state: RootState) => state.userProfile);
    const { generations, status: genStatus } = useSelector((state: RootState) => state.generations);
    const { currentLang: lang } = useSelector((state: RootState) => state.language);



    const t = (key: string) => {
        return (translations[lang]?.[key] ?? key).toString();
    };

    const [modalState, setModalState] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        action: (() => void) | null;
    }>({
        isOpen: false,
        title: '',
        message: '',
        action: null
    });

    // Upload State
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [uploadPreview, setUploadPreview] = useState<string | null>(null);
    const [uploadName, setUploadName] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            setUploadFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setUploadPreview(reader.result as string);
            };
            reader.readAsDataURL(file);
            setUploadError(null);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            setUploadFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setUploadPreview(reader.result as string);
            };
            reader.readAsDataURL(file);
            setUploadError(null);
        }
    };

    const handleUploadClick = async () => {
        if (!uploadFile) return;
        if (!uploadName.trim()) {
            setUploadError(t('imageName')); // Reuse placeholder as error or just simple check
            return;
        }

        setIsUploading(true);
        setUploadError(null);

        try {
            await dispatch(uploadSelfie({ name: uploadName, file: uploadFile })).unwrap();
            // Reset form on success
            setUploadFile(null);
            setUploadPreview(null);
            setUploadName('');
            setIsUploading(false);
        } catch (err: any) {
            console.error(err);
            setUploadError(t('errorUploading') + ': ' + (err.message || err));
            setIsUploading(false);
        }
    };

    const handleRemoveUpload = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setUploadFile(null);
        setUploadPreview(null);
    };

    useEffect(() => {
        if (user) {
            dispatch(fetchGenerations());
        }
    }, [dispatch, user]);

    const closeModal = () => {
        setModalState(prev => ({ ...prev, isOpen: false }));
    };

    const confirmAction = () => {
        if (modalState.action) {
            modalState.action();
        }
        closeModal();
    };

    const handleDownload = async (url: string, filename: string) => {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(blobUrl);
        } catch (error) {
            console.error('Download failed:', error);
            window.open(url, '_blank', 'noopener,noreferrer');
        }
    };

    const handleDeleteSelfie = (id: string, e: React.MouseEvent) => {
        e.preventDefault();
        setModalState({
            isOpen: true,
            title: t('deleteSelfieTitle'),
            message: t('deleteSelfieMsg'),
            action: () => dispatch(deleteSelfie(id))
        });
    };

    const handleDeleteGeneration = (jobId: string, e: React.MouseEvent) => {
        e.preventDefault();
        setModalState({
            isOpen: true,
            title: t('deleteGenTitle'),
            message: t('deleteGenMsg'),
            action: () => dispatch(deleteGeneration(jobId))
        });
    };

    if (!user) {
        const hasToken = localStorage.getItem('google_access_token');
        // If there is a token but no user, we are in a loading state (waiting for fetch)
        // If there is no token, we are not loading (showing sign in prompt)
        if (hasToken) {
            return (
                <div className="account-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
                    <Loader2 className="animate-spin" size={32} />
                </div>
            );
        }

        return (
            <div className="account-container account-loading">
                <p>{t('signInPrompt')}</p>
            </div>
        );
    }



    return (
        <div className="account-container">
            <div className="account-header">
                <div>
                    <h1 style={{ fontSize: '2.5rem', marginBottom: '10px', color: 'var(--text-color)' }}>{t('myAccount')}</h1>
                    <p style={{ color: '#666' }}>{t('manageProfile')}</p>
                </div>
                <a href="/#tariffs" className="credits-card" style={{ textDecoration: 'none' }}>
                    <div className="credits-count">{user.credits ?? 0}</div>
                    <div className="credits-label">{t('availableCredits')}</div>
                </a>
            </div>

            <section className="account-section">
                <h2 className="section-title">{t('generatedImages')}</h2>
                {genStatus === 'loading' && generations.length === 0 ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                        <Loader2 className="animate-spin" size={32} />
                    </div>
                ) : generations.length > 0 ? (
                    <div className="grid-container">
                        {generations.map((gen) => (
                            <div key={gen.jobId} className="image-card">
                                <img src={gen.resultUrl} alt={gen.siteTitle} />
                                <div className="card-overlay" style={{ bottom: '60px' }}>
                                    <button
                                        className="action-btn"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            handleDownload(gen.resultUrl, `generation-${gen.jobId}.jpg`);
                                        }}
                                        title={t('download')}
                                    >
                                        <Download size={18} />
                                    </button>
                                    <button
                                        className="action-btn delete"
                                        onClick={(e) => handleDeleteGeneration(gen.jobId, e)}
                                        title={t('delete')}
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                                <div className="generation-info" style={{ transform: 'translateY(0)', position: 'absolute', bottom: 0, width: '100%', padding: '15px', background: 'white', borderTop: '1px solid #eee' }}>
                                    <div className="generation-title" title={gen.siteTitle}>{gen.siteTitle || 'Generated Style'}</div>
                                    <a href={gen.itemUrl} target="_blank" rel="noopener noreferrer" className="generation-link">
                                        {t('viewItem')} <ExternalLink size={12} />
                                    </a>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="empty-state">
                        <p>{t('noGenerations')}</p>
                    </div>
                )}
            </section>

            <section className="account-section">
                <h2 className="section-title">{t('yourSelfies')}</h2>
                {user.images && user.images.length > 0 ? (
                    <div className="grid-container">
                        {user.images.map((image) => (
                            <div key={image.id} className="image-card">
                                <img src={image.s3Url} alt={`Selfie ${image.name || ''}`} />
                                <div className="card-overlay" style={{ bottom: '60px' }}>
                                    <button
                                        className="action-btn"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            window.open(image.s3Url, '_blank');
                                        }}

                                        title={t('download')}
                                    >
                                        <Download size={18} />
                                    </button>
                                    <button
                                        className="action-btn delete"
                                        onClick={(e) => handleDeleteSelfie(image.id, e)}
                                        title={t('delete')}
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                                <div className="generation-info" style={{ transform: 'translateY(0)', position: 'absolute', bottom: 0, width: '100%', padding: '15px', background: 'white', borderTop: '1px solid #eee' }}>
                                    <div className="generation-title" title={image.name || 'Selfie'}>{image.name || 'Selfie'}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="empty-state">
                        <p>{t('noSelfies')}</p>
                    </div>
                )}
            </section>

            <section className="account-section">
                <h2 className="section-title">{t('uploadSelfie')}</h2>
                <div className="upload-container">
                    <div
                        className={`drop-zone ${uploadPreview ? 'has-preview' : ''}`}
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        onDrop={handleDrop}
                        onClick={() => document.getElementById('file-input')?.click()}
                    >
                        <input
                            type="file"
                            id="file-input"
                            className="hidden-input"
                            accept="image/*"
                            onChange={handleFileSelect}
                        />

                        {uploadPreview ? (
                            <div className="preview-container">
                                <img src={uploadPreview} alt="Preview" className="upload-preview" />
                                <button className="remove-btn" onClick={handleRemoveUpload}>
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ) : (
                            <div className="drop-content">
                                <div className="upload-icon-wrapper">
                                    <Upload size={32} />
                                    <Plus size={16} className="plus-badge" />
                                </div>
                                <p>{t('dropImageHere')}</p>
                                <span className="browse-btn">{t('browseFiles')}</span>
                            </div>
                        )}
                    </div>

                    <div className="upload-controls">
                        <input
                            type="text"
                            className="name-input"
                            placeholder={t('imageName')}
                            value={uploadName}
                            onChange={(e) => setUploadName(e.target.value)}
                        />
                        <button
                            className="upload-submit-btn"
                            disabled={!uploadFile || !uploadName || isUploading}
                            onClick={handleUploadClick}
                        >
                            {isUploading ? <Loader2 className="animate-spin" size={20} /> : t('upload')}
                        </button>
                        {uploadError && <p className="error-message">{uploadError}</p>}
                    </div>
                </div>
            </section>

            <ConfirmationModal
                isOpen={modalState.isOpen}
                onClose={closeModal}
                onConfirm={confirmAction}
                title={modalState.title}
                message={modalState.message}
            />
        </div>
    );
};

export default Account;
