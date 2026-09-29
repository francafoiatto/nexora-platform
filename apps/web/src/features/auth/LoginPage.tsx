import { zodResolver } from '@hookform/resolvers/zod';
import { type LoginInput, loginSchema } from '@nexora/contracts';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { Button } from '../../components/ui/Button';
import { FormError, TextField } from '../../components/ui/Field';
import { applyServerErrors } from '../../lib/forms';
import { useLogin } from './api';
import { AuthLayout } from './AuthLayout';

/** Only same-app paths are allowed as post-login redirects (prevents open redirects). */
export function safeRedirect(target: string | undefined): string {
  return target && target.startsWith('/app') && !target.startsWith('//') ? target : '/app';
}

export function LoginPage() {
  const search = useSearch({ strict: false }) as { redirect?: string };
  const navigate = useNavigate();
  const login = useLogin();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });

  const onSubmit = handleSubmit((values) =>
    login.mutate(values, {
      onSuccess: () => void navigate({ to: safeRedirect(search.redirect) }),
      onError: (error) => applyServerErrors(error, setError, ['email', 'password']),
    }),
  );

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Your team’s operational command center."
      footer={
        <>
          New to Nexora? <Link to="/register">Create an account</Link>
        </>
      }
    >
      <form className="form" onSubmit={onSubmit} noValidate>
        <TextField label="Work email" type="email" autoComplete="email" autoFocus error={errors.email?.message} {...register('email')} />
        <TextField label="Password" type="password" autoComplete="current-password" error={errors.password?.message} {...register('password')} />
        <FormError message={errors.root?.server?.message} />
        <Button type="submit" variant="primary" loading={login.isPending}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
