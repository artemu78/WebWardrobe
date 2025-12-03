import React, { useEffect, useState } from 'react';
import { Tariffs } from '../components/Tariffs';
import '../styles/Home.css';

const translations: any = {
    en: {
        getExtension: "Get Extension",
        heroTitle: "Try On Clothes From <span class=\"gradient-text\">Any Website</span>",
        heroSubtitle: "Experience the future of online shopping. Use your own photo to virtually try on outfits from any store instantly.",
        addToChrome: "Add to Chrome",
        learnMore: "Learn More",
        howItWorks: "How It Works",
        pricing: "Pricing",
        step1Title: "1. Upload Your Selfie",
        step1Desc: "Take a quick photo or upload one from your gallery. Our AI creates a digital model of you.",
        step2Title: "2. Shop Anywhere",
        step2Desc: "Browse your favorite stores. Right-click on a product image you like and select your selfie to apply the virtual try-on.",
        step3Title: "3. Instant Try-On",
        step3Desc: "See yourself wearing the item instantly. Mix and match styles before you buy.",
        tariffsTitle: "Simple Pricing",
        tariffOnTheGo: "On the go",
        priceOnTheGo: "0.4$",
        perCredit: "/ credit",
        tariffOnTheGoDesc: "Top up whatever you like. Perfect for occasional use.",
        payAsYouGo: "Pay as you go",
        noSubscription: "No subscription",
        popular: "Popular",
        tariffStarter: "Starter",
        priceStarter: "10$",
        perMonth: "/ month",
        tariffStarterDesc: "Great for regular shoppers.",
        credits: "credits",
        save20: "Save ~20%",
        tariffStandard: "Standard",
        priceStandard: "20$",
        tariffStandardDesc: "For the fashion enthusiasts.",
        save30: "Save ~30%",
        anyWebsite: "Any Website",
        legalText: "",
        howToInstall: "How to install",
        transformationTitle: "See the Difference",
        pay: "Pay",
        creditPopup: "1 credit = 1 generation"
    },
    ru: {
        getExtension: "Скачать расширение",
        heroTitle: "Примеряй одежду с <span class=\"gradient-text\">любого сайта</span>",
        heroSubtitle: "Будущее онлайн-шопинга уже здесь. Используй свое фото для виртуальной примерки нарядов из любого магазина.",
        addToChrome: "Добавить в Chrome",
        learnMore: "Узнать больше",
        howItWorks: "Как это работает",
        pricing: "Цены",
        step1Title: "1. Загрузи селфи",
        step1Desc: "Сделай фото или загрузи из галереи. Наш ИИ создаст твою цифровую модель.",
        step2Title: "2. Выбирай одежду",
        step2Desc: "Листай любимые магазины. Кликни правой кнопкой мыши на вещь, чтобы примерить.",
        step3Title: "3. Мгновенная примерка",
        step3Desc: "Увидишь себя в обновке мгновенно. Сочетай стили перед покупкой.",
        transformationTitle: "Почувствуй разницу",
        tariffsTitle: "Тарифы",
        tariffOnTheGo: "На ходу",
        priceOnTheGo: "32 руб",
        perCredit: "/ кредит",
        tariffOnTheGoDesc: "Пополняй сколько хочешь. Идеально для редких покупок.",
        payAsYouGo: "Оплата за использование",
        noSubscription: "Без подписки",
        popular: "Популярный",
        tariffStarter: "Стартовый",
        priceStarter: "800 руб",
        perMonth: "/ месяц",
        tariffStarterDesc: "Для регулярного шопинга.",
        credits: "кредитов",
        save20: "Экономия ~20%",
        tariffStandard: "Стандарт",
        priceStandard: "1600 руб",
        tariffStandardDesc: "Для фанатов моды.",
        save30: "Экономия ~30%",
        anyWebsite: "Любого Сайта",
        legalText: "Рева Артем Владимирович ИНН 575400352100",
        howToInstall: "Как установить",
        pay: "Оплатить",
        creditPopup: "1 кредит = 1 генерация"
    },
    de: {
        getExtension: "Erweiterung holen",
        heroTitle: "Kleidung von <span class=\"gradient-text\">jeder Website</span> anprobieren",
        heroSubtitle: "Erlebe die Zukunft des Online-Shoppings. Nutze dein Foto, um Outfits virtuell anzuprobieren.",
        addToChrome: "Zu Chrome hinzufügen",
        learnMore: "Mehr erfahren",
        howItWorks: "Wie es funktioniert",
        pricing: "Preise",
        step1Title: "1. Selfie hochladen",
        step1Desc: "Mach ein Foto oder lade es hoch. Unsere KI erstellt dein digitales Modell.",
        step2Title: "2. Überall shoppen",
        step2Desc: "Stöbere in deinen Lieblingsshops. Rechtsklick auf einen Artikel zum Anprobieren.",
        step3Title: "3. Sofort anprobieren",
        step3Desc: "Sieh dich sofort im neuen Outfit. Kombiniere Styles vor dem Kauf.",
        transformationTitle: "Sieh den Unterschied",
        tariffsTitle: "Preise",
        tariffOnTheGo: "Unterwegs",
        priceOnTheGo: "0.4$",
        perCredit: "/ Credit",
        tariffOnTheGoDesc: "Lade so viel auf, wie du willst. Perfekt für gelegentliche Nutzung.",
        payAsYouGo: "Pay as you go",
        noSubscription: "Kein Abo",
        popular: "Beliebt",
        tariffStarter: "Starter",
        priceStarter: "10$",
        perMonth: "/ Monat",
        tariffStarterDesc: "Ideal für regelmäßige Shopper.",
        credits: "Credits",
        save20: "~20% sparen",
        tariffStandard: "Standard",
        priceStandard: "20$",
        tariffStandardDesc: "Für Modebegeisterte.",
        save30: "~30% sparen",
        anyWebsite: "Jeder Website",
        legalText: "",
        howToInstall: "Installationsanleitung",
        pay: "Bezahlen",
        creditPopup: "1 Credit = 1 Generierung"
    },
    es: {
        getExtension: "Obtener extensión",
        heroTitle: "Pruébate ropa de <span class=\"gradient-text\">cualquier sitio web</span>",
        heroSubtitle: "Experimenta el futuro de las compras online. Usa tu foto para probarte ropa virtualmente.",
        addToChrome: "Añadir a Chrome",
        learnMore: "Saber más",
        howItWorks: "Cómo funciona",
        pricing: "Precios",
        step1Title: "1. Sube tu selfie",
        step1Desc: "Toma una foto o súbela. Nuestra IA crea tu modelo digital.",
        step2Title: "2. Compra donde quieras",
        step2Desc: "Navega por tus tiendas favoritas. Clic derecho en cualquier artículo para probártelo.",
        step3Title: "3. Pruébatelo al instante",
        step3Desc: "Vete con la prenda puesta al instante. Combina estilos antes de comprar.",
        transformationTitle: "Mira la diferencia",
        tariffsTitle: "Precios",
        tariffOnTheGo: "Sobre la marcha",
        priceOnTheGo: "0.4$",
        perCredit: "/ crédito",
        tariffOnTheGoDesc: "Recarga lo que quieras. Perfecto para uso ocasional.",
        payAsYouGo: "Pago por uso",
        noSubscription: "Sin suscripción",
        popular: "Popular",
        tariffStarter: "Starter",
        priceStarter: "10$",
        perMonth: "/ mes",
        tariffStarterDesc: "Genial para compradores habituales.",
        credits: "créditos",
        save20: "Ahorra ~20%",
        tariffStandard: "Estándar",
        priceStandard: "20$",
        tariffStandardDesc: "Para entusiastas de la moda.",
        save30: "Ahorra ~30%",
        anyWebsite: "Cualquier Sitio Web",
        legalText: "",
        howToInstall: "Cómo instalar",
        pay: "Pagar",
        creditPopup: "1 crédito = 1 generación"
    }
};

const Home: React.FC = () => {
    const [lang, setLang] = useState('en');

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const urlLang = urlParams.get('lang');
        const savedLang = localStorage.getItem('webwardrobe_lang');
        let currentLang = 'en';
        if (urlLang && translations[urlLang]) {
            currentLang = urlLang;
        } else if (savedLang && translations[savedLang]) {
            currentLang = savedLang;
        }
        setLang(currentLang);
    }, []);

    const handleLangChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newLang = e.target.value;
        setLang(newLang);
        localStorage.setItem('webwardrobe_lang', newLang);
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('lang', newLang);
        window.history.pushState({}, '', newUrl.toString());
    };

    const t = (key: string) => {
        return translations[lang]?.[key] || key;
    };
    
    const tHtml = (key: string) => {
        return { __html: translations[lang]?.[key] || key };
    };

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

    return (
        <div className="home-page">
            <header>
                <nav>
                    <div className="logo-container" style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                        <img src="/images/logo_48.png" alt="WebWardrobe Logo" style={{height: '32px'}} />
                        <div className="logo">WebWardrobe</div>
                    </div>
                    <ul className="nav-links">
                        <li><a href="#how-it-works">{t('howItWorks')}</a></li>
                        <li><a href="#tariffs">{t('pricing')}</a></li>
                    </ul>
                    <div className="nav-actions" style={{display: 'flex', alignItems: 'center', gap: '15px'}}>
                        <select id="language-select" className="lang-select" value={lang} onChange={handleLangChange}>
                            <option value="en">EN</option>
                            <option value="ru">RU</option>
                            <option value="de">DE</option>
                            <option value="es">ES</option>
                        </select>
                        <a href="#" className="btn-primary">{t('getExtension')}</a>
                    </div>
                </nav>
            </header>

            <section className="hero">
                <div className="hero-content">
                    <h1 dangerouslySetInnerHTML={tHtml('heroTitle')}></h1>
                    <p>{t('heroSubtitle')}</p>
                    <div className="hero-buttons">
                        <a href="#" className="btn-primary">{t('addToChrome')}</a>
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

            <Tariffs t={t} />

            <footer>
                <p>&copy; 2025 WebWardrobe. All rights reserved.</p>
                <p><a href="/install" style={{color: 'inherit', textDecoration: 'underline'}}>{t('howToInstall')}</a></p>
                <p style={{fontSize: '12px', color: '#444', marginTop: '10px'}}>{t('legalText')}</p>
            </footer>
        </div>
    );
};

export default Home;
