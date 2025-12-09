import React, { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '../store/store';
import { fetchGenerations, deleteGeneration } from '../store/generationsSlice';
import { deleteSelfie } from '../store/userProfileSlice';
import { Trash2, Download, ExternalLink, Loader2 } from 'lucide-react';
import '../styles/Account.css';

const Account: React.FC = () => {
    const dispatch = useDispatch<AppDispatch>();
    const { user, status: userStatus } = useSelector((state: RootState) => state.userProfile);
    const { generations, status: genStatus } = useSelector((state: RootState) => state.generations);

    useEffect(() => {
        if (user) {
            dispatch(fetchGenerations());
        }
    }, [dispatch, user]);

    if (!user) {
        return (
            <div className="account-container" style={{display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh'}}>
                {userStatus === 'loading' ? <Loader2 className="animate-spin" size={32} /> : <p>Please sign in to view your account.</p>}
            </div>
        );
    }

    const handleDeleteSelfie = (id: string, e: React.MouseEvent) => {
        e.preventDefault(); 
        if (confirm('Are you sure you want to delete this selfie?')) {
            dispatch(deleteSelfie(id));
        }
    };

    const handleDeleteGeneration = (jobId: string, e: React.MouseEvent) => {
        e.preventDefault();
        if (confirm('Are you sure you want to delete this generated image?')) {
            dispatch(deleteGeneration(jobId));
        }
    };

    return (
        <div className="account-container">
            <div className="account-header">
                <div>
                    <h1 style={{fontSize: '2.5rem', marginBottom: '10px', color: 'var(--text-color)'}}>My Account</h1>
                    <p style={{color: '#666'}}>Manage your profile, selfies, and generated styles.</p>
                </div>
                <a href="/#tariffs" className="credits-card" style={{textDecoration: 'none'}}>
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
                                            window.open(image.s3Url, '_blank');
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
                    <div style={{display: 'flex', justifyContent: 'center', padding: '2rem'}}>
                        <Loader2 className="animate-spin" size={32} />
                    </div>
                ) : generations.length > 0 ? (
                    <div className="grid-container">
                        {generations.map((gen) => (
                            <div key={gen.jobId} className="image-card">
                                <img src={gen.resultUrl} alt={gen.siteTitle} />
                                <div className="card-overlay" style={{bottom: '60px'}}>
                                     <button 
                                        className="action-btn" 
                                        onClick={() => window.open(gen.resultUrl, '_blank')}
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
                                <div className="generation-info" style={{transform: 'translateY(0)', position: 'absolute', bottom: 0, width: '100%', padding: '15px', background: 'white', borderTop: '1px solid #eee'}}>
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
        </div>
    );
};

export default Account;
