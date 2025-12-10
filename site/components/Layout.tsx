import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '../store/store';
import { fetchUserProfile } from '../store/userProfileSlice';
import { setLanguage } from '../store/languageSlice';
import { Header } from './Header';
import { translations } from '../translations';

interface LayoutProps {
    children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
    const dispatch = useDispatch<AppDispatch>();
    const { currentLang } = useSelector((state: RootState) => state.language);

    useEffect(() => {
        dispatch(fetchUserProfile());
    }, [dispatch]);

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const urlLang = urlParams.get('lang');
        const savedLang = localStorage.getItem('webwardrobe_lang');
        
        let initialLang = 'en';
        if (urlLang && translations[urlLang]) {
            initialLang = urlLang;
        } else if (savedLang && translations[savedLang]) {
            initialLang = savedLang;
        }
        
        if (initialLang !== currentLang) {
            dispatch(setLanguage(initialLang));
        }
    }, [dispatch]); // Run once on mount to set initial language

    const handleLangChange = (newLang: string) => {
        dispatch(setLanguage(newLang));
        localStorage.setItem('webwardrobe_lang', newLang);
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('lang', newLang);
        window.history.pushState({}, '', newUrl.toString());
    };

    return (
        <>
            <Header 
                translations={translations} 
                lang={currentLang} 
                onLangChange={handleLangChange} 
            />
            {children}
        </>
    );
};
