import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../store/store';
import { translations } from '../translations';
import { Tariffs } from '../components/Tariffs';
import '../styles/Home.css';
import { API_BASE_URL, chromeStoreUrl } from '../constants';

interface User {
    name: string;
    picture: string;
    email?: string;
    userId?: string;
}



const Home: React.FC = () => {
    const { currentLang: lang } = useSelector((state: RootState) => state.language);
    const [user, setUser] = useState<User | null>(null);

    useEffect(() => {
        const token = localStorage.getItem('google_access_token');
        if (token) {
            fetch(`${API_BASE_URL}/user/profile`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })
            .then(res => res.json())
            .then(data => {
                if (data.name) {
                    setUser({ 
                        name: data.name, 
                        picture: data.picture,
                        email: data.email,
                        userId: data.userId
                    });
                }
            })
            .catch(err => console.error('Failed to fetch profile:', err));
        }
    }, []);



    const t = (key: string) => {
        return (translations[lang]?.[key] ?? key).toString();
    };
    
    const tHtml = (key: string) => {
        return { __html: translations[lang]?.[key] || key };
    };

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('payment') === 'success') {
            window.postMessage({ type: "PAYMENT_SUCCESS" }, "*");
            // Optional: Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
            alert("Payment successful! Your credits have been updated.");
        }
    }, []);

    useEffect(() => {
        const section = document.querySelector('.transformation-section') as HTMLElement;
        const afterImage = document.querySelector('.img-after') as HTMLElement;

        if (section && afterImage) {
            const handleScroll = () => {
                const rect = section.getBoundingClientRect();
                const viewportHeight = window.innerHeight;
                const scrollableDistance = section.offsetHeight - viewportHeight;
                const scrolled = -rect.top;
                let progress = scrolled / scrollableDistance;
                progress = Math.max(0, Math.min(1, progress));
                const percentage = 100 - (progress * 100);
                afterImage.style.clipPath = `inset(0 ${percentage}% 0 0)`;
            };
            window.addEventListener('scroll', handleScroll);
            return () => window.removeEventListener('scroll', handleScroll);
        }
    }, []);

    useEffect(() => {
        if (window.location.hash) {
            const element = document.querySelector(window.location.hash);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth' });
            } else {
                 // Retry once after short delay for slower renders
                 setTimeout(() => {
                    const el = document.querySelector(window.location.hash);
                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                 }, 500);
            }
        }
    }, [lang, user]); // Re-run when content might have changed/loaded


    return (
        <div className="home-page">
            <section className="hero">
                <div className="hero-content">
                    <h1 dangerouslySetInnerHTML={tHtml('heroTitle')}></h1>
                    <p>{t('heroSubtitle')}</p>
                    <div className="hero-buttons">
                        <a href={chromeStoreUrl(lang)} className="btn-primary" target="_blank" rel="noopener noreferrer">{t('addToChrome')}</a>
                        <a href="#how-it-works" className="btn-secondary">{t('learnMore')}</a>
                    </div>
                </div>
                <div className="hero-image">
                    <img src="/images/hero_bg.png" alt="Virtual Try-On Experience" />
                </div>
            </section>

            <section id="how-it-works" className="features">
                <h2>{t('howItWorks')}</h2>
                <div className="feature-grid">
                    <div className="feature-card flip-card">
                        <div className="flip-card-inner">
                            <div className="flip-card-front">
                                <div className="feature-img">
                                    <img src="/images/step1_selfie.png" alt="Upload Selfie" />
                                </div>
                                <h3>{t('step1Title')}</h3>
                                <p>{t('step1Desc')}</p>
                            </div>
                            <div className="flip-card-back">
                                <img src="/images/Screenshot 2025-11-30 at 11.32.17.png" alt="Step 1 Details" />
                            </div>
                        </div>
                    </div>
                    <div className="feature-card flip-card">
                        <div className="flip-card-inner">
                            <div className="flip-card-front">
                                <div className="feature-img">
                                    <img src="/images/step2_shop.png" alt="Shop Anywhere" />
                                </div>
                                <h3>{t('step2Title')}</h3>
                                <p>{t('step2Desc')}</p>
                            </div>
                            <div className="flip-card-back">
                                <img src="/images/Screenshot 2025-11-30 at 11.37.29.png" alt="Step 2 Details" />
                            </div>
                        </div>
                    </div>
                    <div className="feature-card flip-card">
                        <div className="flip-card-inner">
                            <div className="flip-card-front">
                                <div className="feature-img">
                                    <img src="/images/step3_result.png" alt="Instant Try-On" />
                                </div>
                                <h3>{t('step3Title')}</h3>
                                <p>{t('step3Desc')}</p>
                            </div>
                            <div className="flip-card-back">
                                <img src="/images/Screenshot 2025-12-02 at 19.46.19.png" alt="Step 3 Details" />
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section id="transformation" className="transformation-section">
                <div className="sticky-content">
                    <h2>{t('transformationTitle')}</h2>
                    <div className="image-comparison">
                        <img src="/images/example_before.png" className="img-before" alt="Before Try-On" />
                        <img src="/images/example_after.png" className="img-after" alt="After Try-On" />
                    </div>
                </div>
            </section>

            <Tariffs t={t} user={user} lang={lang} />

            <footer>
                <p>&copy; 2025 WebWardrobe. All rights reserved.</p>
                <p style={{fontSize: '12px', color: '#444', marginTop: '10px'}}>{t('legalText')}</p>
            </footer>
        </div>
    );
};

export default Home;
