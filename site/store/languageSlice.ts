import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface LanguageState {
    currentLang: string;
}

const initialState: LanguageState = {
    currentLang: 'en',
};

export const languageSlice = createSlice({
    name: 'language',
    initialState,
    reducers: {
        setLanguage: (state, action: PayloadAction<string>) => {
            state.currentLang = action.payload;
        },
    },
});

export const { setLanguage } = languageSlice.actions;

export default languageSlice.reducer;
