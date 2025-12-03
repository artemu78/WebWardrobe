import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../constants';

const LoginCallback: React.FC = () => {
    const navigate = useNavigate();

    useEffect(() => {
        const handleLogin = async () => {
            // Handle Implicit Flow (access_token in hash)
            const hash = window.location.hash;
            if (hash) {
                const params = new URLSearchParams(hash.substring(1)); // remove #
                const accessToken = params.get('access_token');
                if (accessToken) {
                    localStorage.setItem('google_access_token', accessToken);
                    
                    // Trigger backend to save user info
                    try {
                        await fetch(`${API_BASE_URL}/user/images`, {
                            headers: {
                                'Authorization': `Bearer ${accessToken}`
                            }
                        });
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

    }, [navigate]);

    return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
            Processing login...
        </div>
    );
};

export default LoginCallback;
