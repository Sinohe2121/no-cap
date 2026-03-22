'use client';

import { useState, useEffect, Suspense } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';

const GoogleIcon = () => (
    <svg width="18" height="18" viewBox="0 0 48 48">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
);

function LoginContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);

    // Check for OAuth error in URL params
    useEffect(() => {
        const errorParam = searchParams.get('error');
        if (errorParam === 'NoAccount') {
            setError('No account found for that email. Ask your admin to create one first.');
        } else if (errorParam === 'OAuthAccountNotLinked') {
            setError('This email is already registered with a different sign-in method.');
        }
    }, [searchParams]);

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

    const handleGoogleSignIn = () => {
        setGoogleLoading(true);
        setError('');
        signIn('google', { callbackUrl: '/dashboard' });
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

                {/* Google Sign-In Button */}
                <button
                    onClick={handleGoogleSignIn}
                    disabled={googleLoading}
                    style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 10,
                        padding: '11px 16px',
                        borderRadius: 10,
                        border: '1px solid #E2E4E9',
                        background: '#fff',
                        cursor: googleLoading ? 'wait' : 'pointer',
                        fontSize: 14,
                        fontWeight: 600,
                        color: '#3F4450',
                        transition: 'all 0.15s ease',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                        marginBottom: 24,
                        opacity: googleLoading ? 0.7 : 1,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#FAFBFC'; e.currentTarget.style.borderColor = '#A4A9B6'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#E2E4E9'; }}
                >
                    <GoogleIcon />
                    {googleLoading ? 'Redirecting…' : 'Continue with Google'}
                </button>

                {/* Divider */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    marginBottom: 24,
                }}>
                    <div style={{ flex: 1, height: 1, background: '#E2E4E9' }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#A4A9B6', textTransform: 'uppercase', letterSpacing: '0.06em' }}>or</span>
                    <div style={{ flex: 1, height: 1, background: '#E2E4E9' }} />
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

export default function LoginPage() {
    return (
        <Suspense fallback={
            <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F6F6F9' }}>
                <div style={{ width: 32, height: 32, border: '3px solid #E2E4E9', borderTopColor: '#4141A2', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
            </div>
        }>
            <LoginContent />
        </Suspense>
    );
}
