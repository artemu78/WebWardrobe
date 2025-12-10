import { configureStore } from '@reduxjs/toolkit';
import userProfileReducer from './userProfileSlice';
import generationsReducer from './generationsSlice';
import languageReducer from './languageSlice';

export const store = configureStore({
    reducer: {
        userProfile: userProfileReducer,
        generations: generationsReducer,
        language: languageReducer,
    },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
