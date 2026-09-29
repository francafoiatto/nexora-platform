# Security policy

## Reporting a vulnerability

Please do **not** open a public issue for security problems. Use GitHub's
[private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on this repository, including steps to reproduce and the impact you observed.

## Supported versions

Only the latest `main` is supported while the project is pre-1.0.

## Scope notes

- The demo seed creates fictional accounts with a published password (`demo-password`). It refuses to run with
  `NODE_ENV=production`; never load demo data into a real deployment.
- `docker-compose.yml` credentials (`nexora/nexora`) are for the local container only and the port is bound to `127.0.0.1`.

The security model is documented in [docs/security.md](docs/security.md).
