import React, { useEffect, useState } from 'react';
import { API_BASE_URL, chromeStoreUrl } from '../constants';
import { Link } from 'react-router-dom';

import { Menu, X } from 'lucide-react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '../store/store';
import { fetchUserProfile, clearUser } from '../store/userProfileSlice';
import '../styles/Header.css';

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
                    <a href="/" className="logo-container" style={{textDecoration: 'none'}}>
                        <img src="/images/logo_48.png" alt="WebWardrobe Logo" style={{height: '32px'}} />
                        <div className="logo">WebWardrobe</div>
                    </a>
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
                            <div className="user-menu-container">
                                <div 
                                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                    className="btn-secondary user-menu-trigger"
                                >
                                    <span className="user-name">{user.name}</span>
                                    {user.picture ? (
                                        <img src={user.picture} alt="Avatar" className="user-avatar" />
                                    ) : (
                                        <div className="user-avatar-placeholder"></div>
                                    )}
                                </div>
                                {isDropdownOpen && (
                                    <div className="user-dropdown">
                                        {user.email && (
                                            <div className="dropdown-email">
                                                {user.email}
                                            </div>
                                        )}
                                        <Link 
                                            to="/account" 
                                            className="dropdown-link"
                                            onClick={() => setIsDropdownOpen(false)}
                                        >
                                            Account
                                        </Link>
                                        <button 
                                            onClick={handleSignOut}
                                            className="btn-primary dropdown-btn"
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
