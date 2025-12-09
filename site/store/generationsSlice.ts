import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { fetchWithAuth } from '../utils/api';

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
        try {
            const response = await fetchWithAuth('/user/generations');
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
        try {
            await fetchWithAuth(`/user/generations/${jobId}`, {
                method: 'DELETE',
            });
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
