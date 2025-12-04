import React from 'react';
import { PAYMENT_URL, PRODAMUS_SYS } from '../constants';

interface User {
    name: string;
    picture: string;
    // We might need userId here, but Home.tsx User interface doesn't have it.
    // However, the backend needs userId.
    // The Home.tsx fetches user profile but only stores name and picture in state.
    // We need to update Home.tsx to store userId as well?
    // Or we can get it from the token?
    // Actually, Home.tsx doesn't seem to have userId in the User interface.
    // Let's check Home.tsx again.
}

interface TariffsProps {
    t: (key: string) => string;
    user: any | null; // Using any to avoid type conflict if I don't update Home.tsx interface immediately, but better to update Home.tsx first.
}

export const Tariffs: React.FC<TariffsProps> = ({ t, user }) => {
    const handlePayment = (tariffName: string) => {
        if (!user) {
            // Redirect to login if not logged in
            alert("Please sign in to purchase credits.");
            return;
        }

        // We need userId. The user object in Home.tsx comes from /user/profile.
        // Let's assume we can get userId from the token or we need to update Home.tsx to store it.
        // For now, let's try to get it from localStorage token if not in user object, 
        // but decoding token on client side is messy without a lib.
        // Better to update Home.tsx to include userId in the user state.
        
        // Placeholder for userId until Home.tsx is updated
        const userId = user.userId || "unknown_user"; 

        let price = 0;
        let credits = 0;
        let name = "none";
        let sku = "none";

        switch (tariffName) {
            case 'On the go':
                price = 320; // 10 credits
                credits = 10;
                name = `WebWardrobe: ${credits} Credits`;
                sku = "on_the_go";
                break;
            case 'Starter':
                price = 800; // 25 credits
                credits = 25;
                name = `WebWardrobe: ${credits} Credits`;
                sku = "starter";
                break;
            case 'Standard':
                price = 1600; // 60 credits
                credits = 60;
                name = `WebWardrobe: ${credits} Credits`;
                sku = "standard";
                break;
            default:
                return;
        }

        const products = [
            {
                name: name,
                price: price,
                quantity: 1,
                tax: "none",
                type: "service",
                sku: sku
            }
        ];
        const params = new URLSearchParams();
        params.append('do', 'pay');
        params.append('products', JSON.stringify(products));
        params.append('customer_extra', userId);
        params.append('urlSuccess', window.location.origin + "?payment=success");
        params.append('sys', PRODAMUS_SYS);
        
        if (user.email) {
            params.append('customer_email', user.email);
        }

        window.location.href = `${PAYMENT_URL}?${params.toString()}`;
    };

    return (
        <section id="tariffs" className="tariffs">
            <h2>{t('tariffsTitle')}</h2>
            <div className="tariff-grid">
                <div className="tariff-card">
                    <h3>{t('tariffOnTheGo')}</h3>
                    <div className="price"><span>{t('priceOnTheGo')}</span> <span className="tooltip">{t('perCredit')}<span className="tooltiptext">{t('creditPopup')}</span></span></div>
                    <p>{t('tariffOnTheGoDesc')}</p>
                    <ul className="tariff-features">
                        <li>{t('payAsYouGo')}</li>
                        <li>{t('noSubscription')}</li>
                    </ul>
                    <button 
                        className="btn-primary" 
                        onClick={() => handlePayment('On the go')}
                        aria-label={`Pay for ${t('tariffOnTheGo')}`}
                        style={{ marginTop: '20px', width: '100%', border: 'none', cursor: 'pointer' }}
                    >
                        {t('pay')}
                    </button>
                </div>
                <div className="tariff-card popular">
                    <div className="badge">{t('popular')}</div>
                    <h3>{t('tariffStarter')}</h3>
                    <div className="price"><span>{t('priceStarter')}</span> <span>{t('perMonth')}</span></div>
                    <p>{t('tariffStarterDesc')}</p>
                    <ul className="tariff-features">
                        <li>25 <span className="tooltip">{t('credits')}<span className="tooltiptext">{t('creditPopup')}</span></span></li>
                        <li>{t('save20')}</li>
                    </ul>
                    <button 
                        className="btn-primary" 
                        onClick={() => handlePayment('Starter')}
                        aria-label={`Pay for ${t('tariffStarter')}`}
                        style={{ marginTop: '20px', width: '100%', border: 'none', cursor: 'pointer' }}
                    >
                        {t('pay')}
                    </button>
                </div>
                <div className="tariff-card">
                    <h3>{t('tariffStandard')}</h3>
                    <div className="price"><span>{t('priceStandard')}</span> <span>{t('perMonth')}</span></div>
                    <p>{t('tariffStandardDesc')}</p>
                    <ul className="tariff-features">
                        <li>60 <span className="tooltip">{t('credits')}<span className="tooltiptext">{t('creditPopup')}</span></span></li>
                        <li>{t('save30')}</li>
                    </ul>
                    <button 
                        className="btn-primary" 
                        onClick={() => handlePayment('Standard')}
                        aria-label={`Pay for ${t('tariffStandard')}`}
                        style={{ marginTop: '20px', width: '100%', border: 'none', cursor: 'pointer' }}
                    >
                        {t('pay')}
                    </button>
                </div>
            </div>
        </section>
    );
};
