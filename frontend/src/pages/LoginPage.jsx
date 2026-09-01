import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link, useLocation } from 'react-router-dom';
import { User, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from '../components/ThemeToggle';
import AppLogo from '../components/AppLogo';
import { getPortalHint } from '../api/auth';
import { API_BASE } from '../api/client';
import { hasAuthSession } from '../utils/authSession';
import {
  APP_GUEST_HOUSE,
  APP_MARRIAGE_HALL,
  getDefaultHomePath,
  getAppLoginPortal,
  guessPortalFromUsername,
  normalizeAppType,
  readStoredLoginPortal,
  storeLoginPortal,
} from '../utils/appType';

function fieldErrorMessage(value) {
  if (!value) return '';
  if (Array.isArray(value)) return String(value[0] || '');
  return String(value);
}

const LoginPage = () => {
  const [searchParams] = useSearchParams();
  const portalParam = getAppLoginPortal(`?portal=${searchParams.get('portal') || ''}`);
  const [portal, setPortal] = useState(portalParam ?? readStoredLoginPortal() ?? APP_MARRIAGE_HALL);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated, loading: authLoading, user } = useAuth();

  useEffect(() => {
    if (authLoading) return;
    if (hasAuthSession() && isAuthenticated && user) {
      const from = location.state?.from;
      navigate(from && from !== '/login' ? from : getDefaultHomePath(user), { replace: true });
    }
  }, [authLoading, isAuthenticated, user, navigate, location.state]);

  useEffect(() => {
    const trimmed = username.trim();
    if (!trimmed) return undefined;

    const guessed = guessPortalFromUsername(trimmed);
    if (guessed) {
      setPortal(storeLoginPortal(guessed));
    }

    const timer = setTimeout(() => {
      getPortalHint(trimmed)
        .then((data) => {
          if (data?.app_type) setPortal(storeLoginPortal(data.app_type));
        })
        .catch(() => {
          /* optional hint */
        });
    }, 300);

    return () => clearTimeout(timer);
  }, [username]);

  const clearFieldErrors = () => {
    setError('');
    setUsernameError('');
    setPasswordError('');
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    clearFieldErrors();

    try {
      const loggedIn = await login({ username: username.trim(), password });
      const userApp = normalizeAppType(loggedIn?.app_type);
      storeLoginPortal(userApp);
      const from = location.state?.from;
      navigate(from && from !== '/login' ? from : getDefaultHomePath(loggedIn));
    } catch (err) {
      const data = err.response?.data;
      const usernameMsg = fieldErrorMessage(data?.username);
      const passwordMsg = fieldErrorMessage(data?.password);

      if (!err.response) {
        const isCrossOrigin = API_BASE.startsWith('http');
        setError(
          isCrossOrigin
            ? 'Cannot reach the API server. Check Railway is running and CORS allows this site (FRONTEND_URL on backend).'
            : 'Cannot reach the server. Start the backend, then try again.',
        );
      } else if (usernameMsg) {
        setUsernameError(usernameMsg);
      } else if (passwordMsg) {
        setPasswordError(passwordMsg);
      } else {
        setError(
          fieldErrorMessage(data?.detail)
            || fieldErrorMessage(data?.non_field_errors)
            || 'Unable to sign in. Please check your details and try again.',
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      <ThemeToggle className="theme-toggle--floating" />
      <div className="login-card login-card--wide">
        <div className="login-card__brand">
          <AppLogo size="sm" tone="dark" className="login-card__logo-mark" />
          <div>
            <h1 className="login-card__title">
              Gateway <span className="login-card__title-accent">Centre</span>
            </h1>
          </div>
        </div>

        {error && <div className="login-card__error">{error}</div>}

        <form onSubmit={handleLogin} className="login-form">
          <div className="login-field">
            <label htmlFor="login-username">Username</label>
            <div className={`login-field__wrap${usernameError ? ' login-field__wrap--error' : ''}`}>
              <User size={18} className="login-field__icon" />
              <input
                id="login-username"
                type="text"
                required
                autoComplete="username"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (usernameError) setUsernameError('');
                  if (error) setError('');
                }}
                aria-invalid={!!usernameError}
                aria-describedby={usernameError ? 'login-username-error' : undefined}
              />
            </div>
            {usernameError && (
              <p id="login-username-error" className="login-field__error" role="alert">
                {usernameError}
              </p>
            )}
          </div>

          <div className="login-field">
            <label htmlFor="login-password">Password</label>
            <div className={`login-field__wrap${passwordError ? ' login-field__wrap--error' : ''}`}>
              <Lock size={18} className="login-field__icon" />
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (passwordError) setPasswordError('');
                  if (error) setError('');
                }}
                aria-invalid={!!passwordError}
                aria-describedby={passwordError ? 'login-password-error' : undefined}
              />
              <button
                type="button"
                className="login-field__toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {passwordError && (
              <p id="login-password-error" className="login-field__error" role="alert">
                {passwordError}
              </p>
            )}
          </div>

          <button type="submit" className="login-submit" disabled={isLoading}>
            {isLoading ? 'Signing in…' : (
              <>
                Sign in
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        <p className="login-card__hint">
          <Link to="/">Back to home</Link>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
