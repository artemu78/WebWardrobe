import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '../store/store';
import { fetchGenerations, deleteGeneration } from '../store/generationsSlice';
import { deleteSelfie } from '../store/userProfileSlice';
import { Trash2, Download, ExternalLink, Loader2 } from 'lucide-react';
import '../styles/Account.css';
import { ConfirmationModal } from '../components/ConfirmationModal';

const Account: React.FC = () => {
    const dispatch = useDispatch<AppDispatch>();
    const { user, status: userStatus } = useSelector((state: RootState) => state.userProfile);
    const { generations, status: genStatus } = useSelector((state: RootState) => state.generations);
    
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
            title: 'Delete Selfie',
            message: 'Are you sure you want to delete this selfie? This action cannot be undone.',
            action: () => dispatch(deleteSelfie(id))
        });
    };

    const handleDeleteGeneration = (jobId: string, e: React.MouseEvent) => {
        e.preventDefault();
        setModalState({
            isOpen: true,
            title: 'Delete Generated Image',
            message: 'Are you sure you want to delete this generated image? This action cannot be undone.',
            action: () => dispatch(deleteGeneration(jobId))
        });
    };

    if (!user) {
        const hasToken = localStorage.getItem('google_access_token');
        // If there is a token but no user, we are in a loading state (waiting for fetch)
        // If there is no token, we are not loading (showing sign in prompt)
        if (hasToken) {
             return (
                <div className="account-container account-loading">
                    <Loader2 className="animate-spin" size={32} />
                </div>
            );
        }

        return (
            <div className="account-container account-loading">
                <p>Please sign in to view your account.</p>
            </div>
        );
    }

    return (
        <div className="account-container">
            <div className="account-header">
                <div>
                    <h1>My Account</h1>
                    <p>Manage your profile, selfies, and generated styles.</p>
                </div>
                <a href="/#tariffs" className="credits-card">
                    <div className="credits-count">{user.credits ?? 0}</div>
                    <div className="credits-label">Available Credits</div>
                </a>
            </div>

            <section className="account-section">
                <h2 className="section-title">Your Selfies</h2>
                {user.images && user.images.length > 0 ? (
                    <div className="grid-container">
                        {user.images.map((image) => (
                            <div key={image.id} className="image-card">
                                <img src={image.s3Url} alt={`Selfie ${image.name || ''}`} />
                                <div className="card-overlay">
                                    <button 
                                        className="action-btn" 
                                        onClick={(e) => {
                                            e.preventDefault();
                                            handleDownload(image.s3Url, image.name || `selfie-${image.id}.jpg`);
                                        }}
                                        title="Download"
                                    >
                                        <Download size={18} />
                                    </button>
                                    <button 
                                        className="action-btn delete" 
                                        onClick={(e) => handleDeleteSelfie(image.id, e)}
                                        title="Delete"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="empty-state">
                        <p>No selfies uploaded yet. Use the extension to upload your first selfie!</p>
                    </div>
                )}
            </section>

            <section className="account-section">
                <h2 className="section-title">Generated Images</h2>
                {genStatus === 'loading' && generations.length === 0 ? (
                    <div className="loading-container">
                        <Loader2 className="animate-spin" size={32} />
                    </div>
                ) : generations.length > 0 ? (
                    <div className="grid-container">
                        {generations.map((gen) => (
                            <div key={gen.jobId} className="image-card has-generation">
                                <img src={gen.resultUrl} alt={gen.siteTitle} />
                                <div className="card-overlay">
                                     <button 
                                        className="action-btn" 
                                        onClick={(e) => {
                                            e.preventDefault();
                                            handleDownload(gen.resultUrl, `generation-${gen.jobId}.jpg`);
                                        }}
                                        title="Download"
                                    >
                                        <Download size={18} />
                                    </button>
                                    <button 
                                        className="action-btn delete" 
                                        onClick={(e) => handleDeleteGeneration(gen.jobId, e)}
                                        title="Delete"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                                <div className="generation-info">
                                    <div className="generation-title" title={gen.siteTitle}>{gen.siteTitle || 'Generated Style'}</div>
                                    <a href={gen.itemUrl} target="_blank" rel="noopener noreferrer" className="generation-link">
                                        View Item <ExternalLink size={12} />
                                    </a>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="empty-state">
                        <p>No generated images yet. Start using the extension to create your looks!</p>
                    </div>
                )}
            </section>

            <ConfirmationModal 
                isOpen={modalState.isOpen}
                title={modalState.title}
                message={modalState.message}
                onConfirm={confirmAction}
                onCancel={closeModal}
            />
        </div>
    );
};

export default Account;
