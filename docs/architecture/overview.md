# Nexora Architecture

Browser → React/Vite → Axios query services → NestJS `/api/v1` → domain services → Prisma → PostgreSQL. React and NestJS also communicate over Socket.IO using authenticated `workspace:{workspaceId}` rooms.

## Trust boundaries
- The browser is untrusted and never authorizes by itself.
- JWT is validated by the API guard; workspace membership is checked server-side for every private resource.
- Prisma is the persistence boundary; `passwordHash` is never serialized.

## Future target
Cloudflare Pages → HTTPS/WSS → Railway NestJS + Socket.IO → Railway PostgreSQL is documented only as a future target. AWS services (S3, SQS, SNS/EventBridge, Secrets Manager, RDS, ECS/Fargate) are possible later options, not current dependencies.
