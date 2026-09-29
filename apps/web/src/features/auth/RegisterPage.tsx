import { zodResolver } from '@hookform/resolvers/zod';
import { type RegisterInput, registerSchema } from '@nexora/contracts';
import { Link, useNavigate } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { Button } from '../../components/ui/Button';
import { FormError, TextField } from '../../components/ui/Field';
import { applyServerErrors } from '../../lib/forms';
import { useRegister } from './api';
import { AuthLayout } from './AuthLayout';

export function RegisterPage() {
  const navigate = useNavigate();
  const registerAccount = useRegister();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema), defaultValues: { name: '', email: '', password: '' } });

  const onSubmit = handleSubmit((values) =>
    registerAccount.mutate(values, {
      onSuccess: () => void navigate({ to: '/app' }),
      onError: (error) => applyServerErrors(error, setError, ['name', 'email', 'password']),
    }),
  );

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start operating with clarity."
      footer={
        <>
          Already have an account? <Link to="/login">Sign in</Link>
        </>
      }
    >
      <form className="form" onSubmit={onSubmit} noValidate>
        <TextField label="Full name" autoComplete="name" autoFocus error={errors.name?.message} {...register('name')} />
        <TextField label="Work email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters."
          error={errors.password?.message}
          {...register('password')}
        />
        <FormError message={errors.root?.server?.message} />
        <Button type="submit" variant="primary" loading={registerAccount.isPending}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
