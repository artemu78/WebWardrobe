import React, { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { AppDispatch } from '../store/store';
import { fetchUserProfile } from '../store/userProfileSlice';
import { Header } from './Header';

const translations: any = {
    en: {
        getExtension: "Get Extension",
        howItWorks: "How It Works",
        pricing: "Pricing",
    },
    ru: {
        getExtension: "Скачать расширение",
        howItWorks: "Как это работает",
        pricing: "Цены",
    },
    de: {
        getExtension: "Erweiterung holen",
        howItWorks: "Wie es funktioniert",
        pricing: "Preise",
    },
    es: {
        getExtension: "Obtener extensión",
        howItWorks: "Cómo funciona",
        pricing: "Precios",
    }
};

interface LayoutProps {
    children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
    const dispatch = useDispatch<AppDispatch>();
    const [lang, setLang] = useState('en');

    useEffect(() => {
        dispatch(fetchUserProfile());
    }, [dispatch]);

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

    const handleLangChange = (newLang: string) => {
        setLang(newLang);
        localStorage.setItem('webwardrobe_lang', newLang);
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('lang', newLang);
        window.history.pushState({}, '', newUrl.toString());
    };

    return (
        <>
            <Header 
                translations={translations} 
                lang={lang} 
                onLangChange={handleLangChange} 
            />
            {children}
        </>
    );
};
