import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { API_BASE_URL } from '../constants';

export interface Generation {
    jobId: string;
    resultUrl: string;
    itemUrl: string;
    siteUrl: string;
    siteTitle: string;
    timestamp: string;
}

interface GenerationsState {
    generations: Generation[];
    status: 'idle' | 'loading' | 'succeeded' | 'failed';
    error: string | null;
}

const initialState: GenerationsState = {
    generations: [],
    status: 'idle',
    error: null,
};

export const fetchGenerations = createAsyncThunk(
    'generations/fetchGenerations',
    async (_, { rejectWithValue }) => {
        const token = localStorage.getItem('google_access_token');
        if (!token) return rejectWithValue('No token found');

        try {
            const response = await fetch(`${API_BASE_URL}/user/generations`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Failed to fetch generations');
            const data = await response.json();
            return data.generations as Generation[];
        } catch (error: any) {
            return rejectWithValue(error.message);
        }
    }
);

export const deleteGeneration = createAsyncThunk(
    'generations/deleteGeneration',
    async (jobId: string, { rejectWithValue }) => {
        const token = localStorage.getItem('google_access_token');
        if (!token) return rejectWithValue('No token found');
        
        try {
            const response = await fetch(`${API_BASE_URL}/user/generations/${jobId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Failed to delete generation');
            return jobId;
        } catch (error: any) {
            return rejectWithValue(error.message);
        }
    }
);

const generationsSlice = createSlice({
    name: 'generations',
    initialState,
    reducers: {},
    extraReducers: (builder) => {
        builder
            .addCase(fetchGenerations.pending, (state) => {
                state.status = 'loading';
                state.error = null;
            })
            .addCase(fetchGenerations.fulfilled, (state, action) => {
                state.status = 'succeeded';
                state.generations = action.payload;
            })
            .addCase(fetchGenerations.rejected, (state, action) => {
                state.status = 'failed';
                state.error = action.payload as string;
            })
            .addCase(deleteGeneration.fulfilled, (state, action) => {
                state.generations = state.generations.filter(g => g.jobId !== action.payload);
            });
    },
});

export default generationsSlice.reducer;
