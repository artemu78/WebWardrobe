import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { API_BASE_URL } from '../constants';
import { resizeImage } from '../lib/imageUtils';

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
        const token = localStorage.getItem('google_access_token');
        if (!token) {
            return rejectWithValue('No token found');
        }

        try {
            const response = await fetch(`${API_BASE_URL}/user/profile`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                if (response.status === 401) {
                     localStorage.removeItem('google_access_token');
                }
                throw new Error('Failed to fetch user');
            }

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
        const token = localStorage.getItem('google_access_token');
        if (!token) {
            return rejectWithValue('No token found');
        }

        try {
            const response = await fetch(`${API_BASE_URL}/user/images/${fileId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to delete selfie');
            }

            return fileId;
        } catch (error: any) {
            return rejectWithValue(error.message);
        }
    }
);

interface UploadSelfiePayload {
    name: string;
    file: File;
}

export const uploadSelfie = createAsyncThunk(
    'userProfile/uploadSelfie',
    async ({ name, file }: UploadSelfiePayload, { rejectWithValue }) => {
        const token = localStorage.getItem('google_access_token');
        if (!token) {
            return rejectWithValue('No token found');
        }

        try {
            const thumbnailBlob = await resizeImage(file, 48, 48);

            const res1 = await fetch(`${API_BASE_URL}/user/images/upload-url`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: file.name,
                    contentType: file.type,
                    includeThumbnail: true
                })
            });

            if (!res1.ok) {
                const data1 = await res1.json();
                throw new Error(data1.error || 'Failed to get upload URL');
            }

            const data1 = await res1.json();

            await fetch(data1.uploadUrl, {
                method: 'PUT',
                body: file,
                headers: { 'Content-Type': file.type }
            });

            await fetch(data1.thumbnailUploadUrl, {
                method: 'PUT',
                body: thumbnailBlob,
                headers: { 'Content-Type': file.type }
            });

            const res3 = await fetch(`${API_BASE_URL}/user/images`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name,
                    s3Key: data1.s3Key,
                    fileId: data1.fileId,
                    thumbnailS3Key: data1.thumbnailS3Key
                })
            });

            if (!res3.ok) {
                const err = await res3.json();
                throw new Error(err.error || 'Failed to save profile');
            }

            const newImage = await res3.json();
            return newImage as UserImage;

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
            })
            .addCase(uploadSelfie.pending, (state) => {
                state.status = 'loading';
            })
            .addCase(uploadSelfie.fulfilled, (state, action) => {
                state.status = 'succeeded';
                if (state.user) {
                   // Append the new image. Check if it's already there to be safe (though unexpected)
                   state.user.images.push(action.payload);
                }
            })
            .addCase(uploadSelfie.rejected, (state, action) => {
                state.status = 'failed';
                state.error = action.payload as string;
            });
    },
});

export const { setUser, clearUser } = userProfileSlice.actions;
export default userProfileSlice.reducer;
