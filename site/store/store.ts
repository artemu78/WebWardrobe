import { configureStore } from '@reduxjs/toolkit';
import userProfileReducer from './userProfileSlice';
import generationsReducer from './generationsSlice';

export const store = configureStore({
    reducer: {
        userProfile: userProfileReducer,
        generations: generationsReducer,
    },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
