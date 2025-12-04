import React from 'react';
import { handlePayment } from '../lib/payment';

interface User {
    name: string;
    picture: string;
    email?: string;
    userId?: string;
}

interface TariffsProps {
    t: (key: string) => string;
    user: any | null;
    lang: string;
}

export const Tariffs: React.FC<TariffsProps> = ({ t, user, lang }) => {
    const onPay = (tariffName: string) => {
        handlePayment({ tariffName, user, lang });
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
                        onClick={() => onPay('On the go')}
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
                        onClick={() => onPay('Starter')}
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
                        onClick={() => onPay('Standard')}
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
