import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { fetchWithAuth } from '../utils/api';

export interface UserImage {
    id: string;
    s3Url: string;
    thumbnailUrl?: string;
    name?: string;
}

export interface User {
    name: string;
    picture: string;
    email?: string;
    credits: number;
    images: UserImage[];
}

interface UserProfileState {
    user: User | null;
    status: 'idle' | 'loading' | 'succeeded' | 'failed';
    error: string | null;
}

const initialState: UserProfileState = {
    user: null,
    status: 'idle',
    error: null,
};



export const fetchUserProfile = createAsyncThunk(
    'userProfile/fetchUserProfile',
    async (_, { rejectWithValue }) => {
        try {
            const response = await fetchWithAuth('/user/profile');
            const data = await response.json();
            return data as User;
        } catch (error: any) {
            return rejectWithValue(error.message);
        }
    }
);

export const deleteSelfie = createAsyncThunk(
    'userProfile/deleteSelfie',
    async (fileId: string, { rejectWithValue }) => {
        try {
            await fetchWithAuth(`/user/images/${fileId}`, {
                method: 'DELETE',
            });
            return fileId;
        } catch (error: any) {
            return rejectWithValue(error.message);
        }
    }
);

const userProfileSlice = createSlice({
    name: 'userProfile',
    initialState,
    reducers: {
        setUser: (state, action: PayloadAction<User>) => {
            state.user = action.payload;
            state.status = 'succeeded';
        },
        clearUser: (state) => {
            state.user = null;
            state.status = 'idle';
            state.error = null;
            localStorage.removeItem('google_access_token');
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchUserProfile.pending, (state) => {
                state.status = 'loading';
                state.error = null;
            })
            .addCase(fetchUserProfile.fulfilled, (state, action) => {
                state.status = 'succeeded';
                state.user = action.payload;
            })
            .addCase(fetchUserProfile.rejected, (state, action) => {
                state.status = 'failed';
                state.error = action.payload as string;
                state.user = null;
            })
            .addCase(deleteSelfie.fulfilled, (state, action) => {
                if (state.user) {
                    state.user.images = state.user.images.filter(img => img.id !== action.payload);
                }
            });
    },
});

export const { setUser, clearUser } = userProfileSlice.actions;
export default userProfileSlice.reducer;
