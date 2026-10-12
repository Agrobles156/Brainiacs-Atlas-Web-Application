'use client';

import { useState } from "react";
import { escapeHtml, sanitizeInput } from "@/lib/security";

interface ForgotPasswordHandlerProps {
    initialEmail?: string;
}

export default function useForgotPasswordHandler({ initialEmail = "" }: ForgotPasswordHandlerProps) {
    const [email, setEmail] = useState(initialEmail);
    const [showAlert, setShowAlert] = useState(false);
    const [alertMessage, setAlertMessage] = useState('');
    const [alertType, setAlertType] = useState<'success' | 'error'>('success');

    const handleChange = (value: string) => {
        setEmail(sanitizeInput(value));
    }

    const handleSubmit = async () => {
        setShowAlert(false);
        console.log('handleSubmit called');
        console.log('NEXT_PUBLIC_BACKEND_URL:', process.env.NEXT_PUBLIC_BACKEND_URL);
        console.log('Email:', email);
        try {
            const url = `${process.env.NEXT_PUBLIC_BACKEND_URL || ''}/flask-api/auth/request-password-reset`;
            console.log('Fetch URL:', url);
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email })
            });
            console.log('Response status:', response.status);
            const data = await response.json();
            console.log('Response data:', data);
            if (response.ok) {
                setAlertMessage('Password reset email sent! Check your inbox or spam folder.');
                setAlertType('success');
                setShowAlert(true);
                setEmail('');
            } else {
                setAlertMessage(data.error || 'Failed to send reset email');
                setAlertType('error');
                setShowAlert(true);
            }
        } catch (error) {
            setAlertMessage('Network error. Please try again.');
            setAlertType('error');
            setShowAlert(true);
            console.error('Password reset request failed:', error);
        }
    }

    return {
        email,
        showAlert,
        alertMessage,
        alertType,
        handleChange,
        handleSubmit,
        setShowAlert
    }
}
