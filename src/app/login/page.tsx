'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const result = await signIn('credentials', {
            email: email.trim().toLowerCase(),
            password,
            redirect: false,
        });

        setLoading(false);

        if (result?.error) {
            setError('Invalid email or password.');
        } else {
            router.push('/dashboard');
        }
    };

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#F6F6F9',
            zIndex: 50,
        }}>
            <div style={{
                width: '100%',
                maxWidth: 400,
                background: '#fff',
                borderRadius: 16,
                border: '1px solid #E2E4E9',
                padding: '40px 36px',
                boxShadow: '0 2px 16px rgba(63,68,80,0.08)',
            }}>
                {/* Logo / wordmark */}
                <div style={{ textAlign: 'center', marginBottom: 32 }}>
                    <div style={{
                        width: 48, height: 48,
                        background: '#FA4338',
                        borderRadius: 12,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: 16,
                    }}>
                        <span style={{ color: '#fff', fontWeight: 900, fontSize: 22, letterSpacing: -1 }}>N</span>
                    </div>
                    <h1 style={{ fontSize: 22, fontWeight: 700, color: '#3F4450', margin: 0 }}>No Cap</h1>
                    <p style={{ fontSize: 13, color: '#A4A9B6', marginTop: 4 }}>Software Capitalization Manager</p>
                </div>

                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: 16 }}>
                        <label className="form-label">Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="form-input"
                            placeholder="you@company.com"
                            required
                            autoComplete="email"
                        />
                    </div>

                    <div style={{ marginBottom: 24 }}>
                        <label className="form-label">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="form-input"
                            placeholder="••••••••"
                            required
                            autoComplete="current-password"
                        />
                    </div>

                    {error && (
                        <div style={{
                            background: '#FFF5F5',
                            border: '1px solid rgba(250,67,56,0.25)',
                            borderRadius: 8,
                            padding: '10px 14px',
                            marginBottom: 16,
                            fontSize: 13,
                            color: '#FA4338',
                        }}>
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="btn-primary"
                        style={{ width: '100%', justifyContent: 'center' }}
                    >
                        {loading ? 'Signing in…' : 'Sign In'}
                    </button>
                </form>

                <p style={{ fontSize: 11, color: '#A4A9B6', textAlign: 'center', marginTop: 24 }}>
                    Contact your admin to create or reset your account.
                </p>
            </div>
        </div>
    );
}
