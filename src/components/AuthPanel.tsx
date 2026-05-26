import { FormEvent } from 'react';

interface AuthPanelProps {
  email: string;
  password: string;
  isSignUp: boolean;
  busy: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onModeToggle: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export default function AuthPanel({
  email,
  password,
  isSignUp,
  busy,
  onEmailChange,
  onPasswordChange,
  onModeToggle,
  onSubmit,
}: AuthPanelProps) {
  return (
    <section className="auth-panel">
      <p className="eyebrow">Plant archive</p>
      <h1>{isSignUp ? 'Start your field journal.' : 'Welcome back to PlantDex.'}</h1>
      <p className="lead">
        Capture a plant, identify it in the browser, and keep a searchable collection tied to your
        Supabase account.
      </p>

      <form className="auth-form" onSubmit={onSubmit}>
        <label className="field">
          <span>Email</span>
          <input
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            type="email"
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
          />
        </label>

        <label className="field">
          <span>Password</span>
          <input
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            placeholder="••••••••"
            type="password"
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
          />
        </label>

        <button className="primary-button" disabled={busy} type="submit">
          {busy ? 'Working...' : isSignUp ? 'Create account' : 'Sign in'}
        </button>
      </form>

      <button className="ghost-link" onClick={onModeToggle} type="button">
        {isSignUp ? 'Already have an account? Sign in.' : 'Need an account? Create one.'}
      </button>
    </section>
  );
}
