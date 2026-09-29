import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { session } from '../../lib/session';
import { mockSocketModule } from '../../test/socket-mock';
import { mockApi, renderApp, USER, workspaceRoutes } from '../../test/utils';
import { safeRedirect } from './LoginPage';

vi.mock('../realtime/socket', () => mockSocketModule());

describe('LoginPage', () => {
  it('starts empty (no pre-filled credentials) and validates before calling the API', async () => {
    const calls = mockApi({});
    renderApp('/login');
    const email = await screen.findByLabelText('Work email');
    expect(email).toHaveValue('');
    expect(screen.getByLabelText('Password')).toHaveValue('');

    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(calls).toHaveLength(0);
  });

  it('shows invalid-email validation', async () => {
    mockApi({});
    renderApp('/login');
    await userEvent.type(await screen.findByLabelText('Work email'), 'not-an-email');
    await userEvent.type(screen.getByLabelText('Password'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
  });

  it('shows the API error for invalid credentials and stays signed out', async () => {
    mockApi({
      'POST /auth/login': () => ({ status: 401, data: { statusCode: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid email or password', details: [] } }),
    });
    renderApp('/login');
    await userEvent.type(await screen.findByLabelText('Work email'), 'alex@example.test');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(session.get()).toBeNull();
  });

  it('shows a network error when the API is unreachable', async () => {
    mockApi({ 'POST /auth/login': () => ({ status: 599 }) });
    renderApp('/login');
    await userEvent.type(await screen.findByLabelText('Work email'), 'alex@example.test');
    await userEvent.type(screen.getByLabelText('Password'), 'pw');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i);
  });

  it('signs in with normalized email and lands in the app', async () => {
    const calls = mockApi(
      workspaceRoutes({
        'POST /auth/login': () => ({ status: 200, data: { accessToken: 'jwt', expiresIn: 7200, user: USER } }),
        'GET /workspaces': () => ({ status: 200, data: [] }),
      }),
    );
    const { router } = renderApp('/login');
    await userEvent.type(await screen.findByLabelText('Work email'), '  Alex@Example.TEST ');
    await userEvent.type(screen.getByLabelText('Password'), 'correct-password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { name: 'Create your first workspace' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/app');
    expect(calls.find((c) => c.path === '/auth/login')?.body).toEqual({ email: 'alex@example.test', password: 'correct-password' });
    expect(session.get()?.token).toBe('jwt');
  });
});

describe('RegisterPage', () => {
  it('maps a server field error (email taken) onto the email input', async () => {
    mockApi({
      'POST /auth/register': () => ({
        status: 409,
        data: { statusCode: 409, code: 'EMAIL_TAKEN', message: 'An account with this email already exists', details: [{ field: 'email', message: 'An account with this email already exists' }] },
      }),
    });
    renderApp('/register');
    await userEvent.type(await screen.findByLabelText('Full name'), 'Jordan Lee');
    await userEvent.type(screen.getByLabelText('Work email'), 'jordan@example.test');
    await userEvent.type(screen.getByLabelText('Password'), 'long-password');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('An account with this email already exists')).toBeInTheDocument();
    expect(screen.getByLabelText('Work email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('enforces the password minimum length', async () => {
    mockApi({});
    renderApp('/register');
    await userEvent.type(await screen.findByLabelText('Full name'), 'Jordan');
    await userEvent.type(screen.getByLabelText('Work email'), 'jordan@example.test');
    await userEvent.type(screen.getByLabelText('Password'), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Password must be at least 8 characters')).toBeInTheDocument();
  });
});

describe('route guards', () => {
  it('redirects anonymous users from /app to /login with a return path', async () => {
    mockApi({});
    const { router } = renderApp('/app/some-workspace');
    await screen.findByRole('heading', { name: 'Welcome back' });
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toEqual({ redirect: '/app/some-workspace' });
  });

  it('sends users back to /login when the API rejects their token', async () => {
    session.set({ accessToken: 'revoked', expiresIn: 3600, user: USER });
    mockApi({ 'GET /workspaces': () => ({ status: 401, data: { statusCode: 401, code: 'UNAUTHORIZED', message: 'Authentication required', details: [] } }) });
    const { router } = renderApp('/app');
    await screen.findByRole('heading', { name: 'Welcome back' });
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(session.get()).toBeNull();
  });

  it('only accepts in-app redirect targets', () => {
    expect(safeRedirect('/app/abc')).toBe('/app/abc');
    expect(safeRedirect('https://evil.example')).toBe('/app');
    expect(safeRedirect('//evil.example')).toBe('/app');
    expect(safeRedirect(undefined)).toBe('/app');
  });
});
