import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import userProfileReducer, {
    setUser,
    clearUser,
    fetchUserProfile,
    User
} from './userProfileSlice';
import { configureStore } from '@reduxjs/toolkit';

describe('userProfileSlice', () => {
    const initialState = {
        user: null,
        status: 'idle' as const,
        error: null,
    };

    const mockUser: User = {
        name: 'Test User',
        picture: 'test.jpg',
        email: 'test@example.com',
    };

    it('should handle initial state', () => {
        expect(userProfileReducer(undefined, { type: 'unknown' })).toEqual(initialState);
    });

    it('should handle setUser', () => {
        const actual = userProfileReducer(initialState, setUser(mockUser));
        expect(actual.user).toEqual(mockUser);
        expect(actual.status).toEqual('succeeded');
    });

    it('should handle clearUser', () => {
        const stateWithUser = {
            user: mockUser,
            status: 'succeeded' as const,
            error: null,
        };
        const actual = userProfileReducer(stateWithUser, clearUser());
        expect(actual).toEqual(initialState);
    });

    describe('fetchUserProfile', () => {
        let store: any;

        beforeEach(() => {
            store = configureStore({
                reducer: {
                    userProfile: userProfileReducer,
                },
            });
            vi.stubGlobal('fetch', vi.fn());
            localStorage.clear();
        });

        afterEach(() => {
            vi.unstubAllGlobals();
        });

        it('should fail if no token is present', async () => {
            await store.dispatch(fetchUserProfile());
            const state = store.getState().userProfile;
            expect(state.status).toEqual('failed');
            expect(state.error).toEqual('No token found');
        });

        it('should succeed with valid token and response', async () => {
            localStorage.setItem('google_access_token', 'fake-token');
            
            const mockResponse = {
                ok: true,
                json: async () => mockUser,
            };
            vi.mocked(fetch).mockResolvedValue(mockResponse as any);

            await store.dispatch(fetchUserProfile());
            const state = store.getState().userProfile;
            
            expect(state.status).toEqual('succeeded');
            expect(state.user).toEqual(mockUser);
            expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/user/profile'), expect.objectContaining({
                headers: {
                    'Authorization': 'Bearer fake-token'
                }
            }));
        });

        it('should handle API error', async () => {
            localStorage.setItem('google_access_token', 'fake-token');
            
            const mockResponse = {
                ok: false,
                status: 500,
            };
            vi.mocked(fetch).mockResolvedValue(mockResponse as any);

            await store.dispatch(fetchUserProfile());
            const state = store.getState().userProfile;
            
            expect(state.status).toEqual('failed');
            expect(state.error).toEqual('Failed to fetch user');
        });
        
        it('should clear token on 401 error', async () => {
             localStorage.setItem('google_access_token', 'invalid-token');
             
             const mockResponse = {
                 ok: false,
                 status: 401,
             };
             vi.mocked(fetch).mockResolvedValue(mockResponse as any);
             
             await store.dispatch(fetchUserProfile());
             
             expect(localStorage.getItem('google_access_token')).toBeNull();
        });
    });
});
