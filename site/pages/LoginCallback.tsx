import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { AppDispatch } from '../store/store';
import { fetchUserProfile } from '../store/userProfileSlice';

const LoginCallback: React.FC = () => {
    const navigate = useNavigate();
    const dispatch = useDispatch<AppDispatch>();
    const [status, setStatus] = useState('Processing login...');

    useEffect(() => {
        const handleLogin = async () => {
            // Handle Implicit Flow (access_token in hash)
            const hash = window.location.hash;
            if (hash) {
                const params = new URLSearchParams(hash.substring(1)); // remove #
                const accessToken = params.get('access_token');
                if (accessToken) {
                    localStorage.setItem('google_access_token', accessToken);
                    
                    setStatus('Syncing profile...');
                    
                    // Trigger backend to save user info and wait for response
                    try {
                        await dispatch(fetchUserProfile()).unwrap();
                        console.log('Profile synced');
                    } catch (e) {
                        console.error("Failed to sync user profile", e);
                    }

                    navigate('/');
                    return;
                }
            }

            // Handle Auth Code Flow (code in search) - if we were using that
            const search = window.location.search;
            if (search) {
                const params = new URLSearchParams(search);
                const code = params.get('code');
                if (code) {
                    // We are not using auth-code flow for now as backend expects access_token
                    console.log('Received auth code:', code);
                }
            }
            
            // If no token found, redirect to home anyway
            navigate('/');
        };

        handleLogin();

    }, [navigate, dispatch]);

    return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
            {status}
        </div>
    );
};

export default LoginCallback;
