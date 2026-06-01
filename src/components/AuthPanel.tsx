import { FormEvent } from 'react';
import HCaptcha from '@hcaptcha/react-hcaptcha';

export type AuthMode = 'sign-in' | 'sign-up' | 'forgot-password' | 'reset-password';

interface AuthPanelProps {
  captchaSiteKey?: string;
  captchaToken?: string | null;
  captchaWidgetKey?: number;
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
  onCaptchaError?: () => void;
  onCaptchaExpire?: () => void;
  onCaptchaVerify?: (token: string) => void;
  onModeChange: (mode: AuthMode) => void;
  onResendConfirmationEmail?: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export default function AuthPanel({
  captchaSiteKey,
  captchaToken,
  captchaWidgetKey = 0,
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
  onCaptchaError,
  onCaptchaExpire,
  onCaptchaVerify,
  onModeChange,
  onResendConfirmationEmail,
  onSubmit,
}: AuthPanelProps) {
  const isSignUp = mode === 'sign-up';
  const isForgotPassword = mode === 'forgot-password';
  const isResetPassword = mode === 'reset-password';
  const isSignIn = mode === 'sign-in';
  const hasCaptchaSiteKey = Boolean(captchaSiteKey?.trim());
  const submitDisabled = busy || (isSignUp && !hasCaptchaSiteKey);

  const title = isResetPassword
    ? 'Create a new password.'
    : isForgotPassword
      ? 'Reset your password.'
      : isSignUp
        ? 'Start your plant collection.'
        : 'Welcome back.';

  const lead = isResetPassword
    ? `Set a new password for ${recoveryEmail?.trim() || 'your account'} and head back into Florivu.`
    : isForgotPassword
      ? 'Enter the email tied to your Florivu account and we will send a reset link.'
      : 'Keep a simple plant collection, revisit care tips, and save the plants you love in one place.';

  const primaryLabel = isResetPassword
    ? 'Update password'
    : isForgotPassword
      ? 'Send reset link'
      : isSignUp
        ? 'Create account'
        : 'Sign in';

  return (
    <section className="auth-panel">
      <p className="eyebrow">Florivu account</p>
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

        {isSignUp ? (
          <div className="auth-captcha">
            <span>Human check</span>
            {hasCaptchaSiteKey ? (
              <>
                <div className="auth-captcha__widget">
                  <HCaptcha
                    key={`signup-hcaptcha-${captchaWidgetKey}`}
                    onError={() => onCaptchaError?.()}
                    onExpire={() => onCaptchaExpire?.()}
                    onVerify={(token) => onCaptchaVerify?.(token)}
                    sitekey={captchaSiteKey!}
                  />
                </div>
                <p className="field-hint">
                  {captchaToken
                    ? 'Verification complete. You can create your account now.'
                    : 'Complete the hCaptcha challenge before creating your account.'}
                </p>
              </>
            ) : (
              <p className="auth-panel__note auth-panel__note--warning">
                Account creation is unavailable until the public hCaptcha site key is configured.
              </p>
            )}
          </div>
        ) : null}

        <button className="primary-button" disabled={submitDisabled} type="submit">
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

        {(isSignIn || isSignUp) && onResendConfirmationEmail ? (
          <button
            className="ghost-link"
            disabled={busy}
            onClick={onResendConfirmationEmail}
            type="button"
          >
            Resend confirmation email
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
