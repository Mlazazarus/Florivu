import { FormEvent } from 'react';

export type AuthMode = 'sign-in' | 'sign-up' | 'forgot-password' | 'reset-password';

interface AuthPanelProps {
  mode: AuthMode;
  email: string;
  password: string;
  resetPassword: string;
  resetPasswordConfirm: string;
  busy: boolean;
  recoveryEmail?: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onResetPasswordChange: (value: string) => void;
  onResetPasswordConfirmChange: (value: string) => void;
  onModeChange: (mode: AuthMode) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export default function AuthPanel({
  mode,
  email,
  password,
  resetPassword,
  resetPasswordConfirm,
  busy,
  recoveryEmail,
  onEmailChange,
  onPasswordChange,
  onResetPasswordChange,
  onResetPasswordConfirmChange,
  onModeChange,
  onSubmit,
}: AuthPanelProps) {
  const isSignUp = mode === 'sign-up';
  const isForgotPassword = mode === 'forgot-password';
  const isResetPassword = mode === 'reset-password';
  const isSignIn = mode === 'sign-in';

  const title = isResetPassword
    ? 'Create a new password.'
    : isForgotPassword
      ? 'Reset your password.'
      : isSignUp
        ? 'Start your field journal.'
        : 'Welcome back to PlantDex.';

  const lead = isResetPassword
    ? `Set a new password for ${recoveryEmail?.trim() || 'your account'} and return to PlantDex.`
    : isForgotPassword
      ? 'Enter the email tied to your PlantDex account and we will send a reset link.'
      : 'Capture a plant, identify it in the browser, and keep a searchable collection tied to your Supabase account.';

  const primaryLabel = isResetPassword
    ? 'Update password'
    : isForgotPassword
      ? 'Send reset link'
      : isSignUp
        ? 'Create account'
        : 'Sign in';

  return (
    <section className="auth-panel">
      <p className="eyebrow">Plant archive</p>
      <h1>{title}</h1>
      <p className="lead">{lead}</p>

      {isResetPassword ? (
        <p className="auth-panel__note">
          Choose a password you have not used before. If the recovery link expires, request a new
          one from the sign-in page.
        </p>
      ) : null}

      <form className="auth-form" onSubmit={onSubmit}>
        {isForgotPassword ? (
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
        ) : null}

        {!isForgotPassword && !isResetPassword ? (
          <>
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
                placeholder="Enter your password"
                type="password"
                value={password}
                onChange={(event) => onPasswordChange(event.target.value)}
              />
            </label>
          </>
        ) : null}

        {isResetPassword ? (
          <>
            <label className="field">
              <span>New password</span>
              <input
                autoComplete="new-password"
                placeholder="Enter a new password"
                type="password"
                value={resetPassword}
                onChange={(event) => onResetPasswordChange(event.target.value)}
              />
            </label>

            <label className="field">
              <span>Confirm password</span>
              <input
                autoComplete="new-password"
                placeholder="Confirm the new password"
                type="password"
                value={resetPasswordConfirm}
                onChange={(event) => onResetPasswordConfirmChange(event.target.value)}
              />
            </label>
          </>
        ) : null}

        <button className="primary-button" disabled={busy} type="submit">
          {busy ? 'Working...' : primaryLabel}
        </button>
      </form>

      <div className="auth-panel__links">
        {isSignIn ? (
          <button
            className="ghost-link"
            disabled={busy}
            onClick={() => onModeChange('forgot-password')}
            type="button"
          >
            Forgot password?
          </button>
        ) : null}

        {isSignUp ? (
          <button
            className="ghost-link"
            disabled={busy}
            onClick={() => onModeChange('sign-in')}
            type="button"
          >
            Already have an account? Sign in.
          </button>
        ) : null}

        {isForgotPassword ? (
          <button
            className="ghost-link"
            disabled={busy}
            onClick={() => onModeChange('sign-in')}
            type="button"
          >
            Back to sign in
          </button>
        ) : null}

        {isSignIn ? (
          <button
            className="ghost-link"
            disabled={busy}
            onClick={() => onModeChange('sign-up')}
            type="button"
          >
            Need an account? Create one.
          </button>
        ) : null}
      </div>
    </section>
  );
}
