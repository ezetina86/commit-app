import { useState, useEffect } from 'react';
import App from '../App';
import { LoginPage } from './login-page';

type AuthState = 'loading' | 'authed' | 'unauthed';

export function AuthGate() {
  const [auth, setAuth] = useState<AuthState>('loading');

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => setAuth(res.ok ? 'authed' : 'unauthed'))
      .catch(() => setAuth('unauthed'));
  }, []);

  if (auth === 'loading') return null;
  if (auth === 'unauthed') return <LoginPage onLogin={() => setAuth('authed')} />;
  return <App onLogout={() => setAuth('unauthed')} />;
}
