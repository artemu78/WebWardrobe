import { API_BASE_URL } from '../constants';

export async function fetchWithAuth(url: string, options: RequestInit = {}) {
    const token = localStorage.getItem('google_access_token');
    if (!token) {
        throw new Error('No token found');
    }

    const headers: HeadersInit = {
        ...options.headers,
        'Authorization': `Bearer ${token}`
    };

    const response = await fetch(`${API_BASE_URL}${url}`, {
        ...options,
        headers
    });

    if (response.status === 401) {
        localStorage.removeItem('google_access_token');
        throw new Error('Unauthorized');
    }

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Request failed with status ${response.status}`);
    }

    return response;
}
