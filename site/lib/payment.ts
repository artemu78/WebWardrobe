import { API_BASE_URL } from '../constants';

interface PaymentParams {
    tariffName: string;
    user: any;
    lang: string;
}

export const handlePayment = async ({ tariffName, user, lang }: PaymentParams) => {
    if (!user) {
        alert("Please sign in to purchase credits.");
        return;
    }

    const token = localStorage.getItem('google_access_token');
    if (!token) {
        alert("Please sign in again.");
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/payment/link`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                tariffName,
                lang
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to generate payment link');
        }

        const data = await response.json();
        if (data.url) {
            window.location.href = data.url;
        } else {
            throw new Error('Invalid response from server');
        }

    } catch (error) {
        console.error("Payment error:", error);
        alert("Failed to initiate payment. Please try again.");
    }
};
