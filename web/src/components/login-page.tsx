import { useState } from 'react';

export function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        onLogin();
      } else {
        setError('Invalid credentials');
      }
    } catch {
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0B0E14] flex items-center justify-center font-mono">
      <div className="bg-[#161B22] p-10 rounded-sm w-full max-w-sm flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-tight text-[#E6EDF3]">Commit</h1>
          <p className="text-[#7D8590] text-xs uppercase tracking-widest mt-1">Precision Habit Tracking</p>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="username" className="text-[#7D8590] text-xs uppercase tracking-widest">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              className="bg-[#0B0E14] text-[#E6EDF3] px-4 py-2 rounded-sm outline-none focus-visible:ring-1 focus-visible:ring-[#39D353] border border-transparent"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-[#7D8590] text-xs uppercase tracking-widest">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="bg-[#0B0E14] text-[#E6EDF3] px-4 py-2 rounded-sm outline-none focus-visible:ring-1 focus-visible:ring-[#39D353] border border-transparent"
            />
          </div>
          {error && (
            <p role="alert" className="text-[#f87171] text-xs font-mono">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="bg-[#39D353] text-[#0B0E14] py-2 rounded-sm font-bold uppercase tracking-wider hover:bg-white transition-colors disabled:opacity-50 cursor-pointer"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
