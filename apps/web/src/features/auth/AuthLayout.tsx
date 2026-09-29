import type { ReactNode } from 'react';
import { Logo } from '../../components/layout/Logo';

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <main className="auth">
      <section className="auth-card" aria-labelledby="auth-title">
        <Logo />
        <p className="eyebrow">Real-time operations platform</p>
        <h1 id="auth-title">{title}</h1>
        <p className="muted">{subtitle}</p>
        {children}
        <div className="auth-footer">{footer}</div>
      </section>
    </main>
  );
}
