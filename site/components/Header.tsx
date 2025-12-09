import React, { useEffect, useState } from 'react';
import { API_BASE_URL, chromeStoreUrl } from '../constants';


import { Menu, X } from 'lucide-react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '../store/store';
import { fetchUserProfile, clearUser } from '../store/userProfileSlice';

interface HeaderProps {
    translations: any;
    lang: string;
    onLangChange: (lang: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ translations, lang, onLangChange }) => {
    const dispatch = useDispatch<AppDispatch>();
    const { user } = useSelector((state: RootState) => state.userProfile);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const handleLogin = () => {
        const clientId = "20534293634-a3r95j8cifmbgon1se9g7me9fbebu5aq.apps.googleusercontent.com";
        const origin = window.location.origin.replace('localhost', '127.0.0.1');
        const redirectUri = `${origin}/login_callback`;
        const scope = "email profile openid";
        const responseType = "token";
        
        const authUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=${responseType}&scope=${encodeURIComponent(scope)}`;
        
        window.location.href = authUrl;
    };

    useEffect(() => {
        const token = localStorage.getItem('google_access_token');
        if (token && !user) {
            dispatch(fetchUserProfile());
        }
    }, [dispatch, user]);

    const handleSignOut = () => {
        dispatch(clearUser());
        setIsDropdownOpen(false);
    };

    const handleLangChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        onLangChange(e.target.value);
    };

    const t = (key: string) => {
        return (translations[lang]?.[key] ?? key).toString();
    };

    const toggleMobileMenu = () => {
        setIsMobileMenuOpen(!isMobileMenuOpen);
    };

    return (
        <header>
            <nav>
                <div className="nav-header">
                    <div className="logo-container">
                        <img src="/images/logo_48.png" alt="WebWardrobe Logo" style={{height: '32px'}} />
                        <div className="logo">WebWardrobe</div>
                    </div>
                    <button className="mobile-menu-btn" onClick={toggleMobileMenu} aria-label="Toggle menu">
                        {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                    </button>
                </div>
                
                <div className={`nav-content ${isMobileMenuOpen ? 'open' : ''}`}>
                    <ul className="nav-links">
                        <li><a href="/#how-it-works" onClick={() => setIsMobileMenuOpen(false)}>{t('howItWorks')}</a></li>
                        <li><a href="/#tariffs" onClick={() => setIsMobileMenuOpen(false)}>{t('pricing')}</a></li>
                    </ul>
                    <div className="nav-actions">
                        <select id="language-select" className="lang-select" value={lang} onChange={handleLangChange}>
                            <option value="en">EN</option>
                            <option value="ru">RU</option>
                            <option value="de">DE</option>
                            <option value="es">ES</option>
                        </select>
                        <a href={chromeStoreUrl(lang)} className="btn-primary" target="_blank" rel="noopener noreferrer">{t('getExtension')}</a>
                        {user ? (
                            <div style={{position: 'relative'}}>
                                <div 
                                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                    className="btn-secondary"
                                    style={{
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '8px', 
                                        cursor: 'pointer',
                                        padding: '10px 20px',
                                        border: '2px solid var(--primary-color)',
                                        borderRadius: '30px',
                                        background: 'transparent',
                                        transition: 'background 0.2s',
                                        fontWeight: 600
                                    }}
                                >
                                    <span style={{fontSize: '14px', color: 'white'}}>{user.name}</span>
                                    {user.picture ? (
                                        <img src={user.picture} alt="Avatar" style={{width: '24px', height: '24px', borderRadius: '50%'}} />
                                    ) : (
                                        <div style={{width: '24px', height: '24px', borderRadius: '50%', backgroundColor: '#ccc'}}></div>
                                    )}
                                </div>
                                {isDropdownOpen && (
                                    <div style={{
                                        position: 'absolute',
                                        top: '100%',
                                        right: 0,
                                        marginTop: '8px',
                                        backgroundColor: 'white',
                                        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                                        borderRadius: '8px',
                                        padding: '8px',
                                        zIndex: 100,
                                        minWidth: '200px'
                                    }}>
                                        {user.email && (
                                            <div style={{
                                                padding: '8px 12px', 
                                                fontSize: '12px', 
                                                color: '#666', 
                                                borderBottom: '1px solid #eee', 
                                                marginBottom: '8px',
                                                wordBreak: 'break-all'
                                            }}>
                                                {user.email}
                                            </div>
                                        )}
                                        <a href="/account" style={{
                                            display: 'block',
                                            width: '100%',
                                            padding: '10px 12px',
                                            color: '#333',
                                            textDecoration: 'none',
                                            fontSize: '14px',
                                            fontWeight: 600,
                                            borderRadius: '4px',
                                            marginBottom: '4px',
                                            boxSizing: 'border-box',
                                            cursor: 'pointer'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                        >
                                            Account
                                        </a>
                                        <button 
                                            onClick={handleSignOut}
                                            className="btn-primary"
                                            style={{
                                                width: '100%',
                                                padding: '10px 20px',
                                                border: 'none',
                                                borderRadius: '30px',
                                                cursor: 'pointer',
                                                fontSize: '14px',
                                                fontWeight: 600
                                            }}
                                        >
                                            Sign out
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <button onClick={handleLogin} className="btn-secondary" style={{border: 'none', cursor: 'pointer'}}>Sign in</button>
                        )}
                    </div>
                </div>
            </nav>
        </header>
    );
};
