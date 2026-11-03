# Local Development Configuration

Start with the complete Windows guide: [English](INSTALL_WINDOWS.md) | [Türkçe](INSTALL_WINDOWS.tr.md).

## Supported workflow

Run `npm.cmd ci`, `npm.cmd run local:setup`, then `npm.cmd run local:dev` from the project root. These commands use `compose.local.yml` and the private `.env.docker` file. They bind the application and database to loopback and use a development-only demo identity.

| Setting in `.env.docker`  | Default             | Meaning                                                                                                                                           |
| ------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LOCAL_COMPOSE_PROJECT`   | `vocabulary-local`  | Compose project and named-volume prefix; permitted alternatives begin with `vocabulary-local-` and contain lowercase letters, digits and hyphens. |
| `LOCAL_POSTGRES_PORT`     | `5433`              | PostgreSQL host port on `127.0.0.1`.                                                                                                              |
| `LOCAL_API_PORT`          | `3000`              | Fastify port; the Vite proxy follows this value.                                                                                                  |
| `LOCAL_WEB_PORT`          | `5173`              | Vite port; startup refuses an occupied port.                                                                                                      |
| `LOCAL_MIGRATOR_PASSWORD` | Generated privately | Bootstrap/migration password; retain the original value once initialized.                                                                         |
| `LOCAL_APP_PASSWORD`      | Generated privately | Separate limited runtime-role password.                                                                                                           |

Only these six keys are allowed. Ports must be distinct, between 1024 and 65535, and different from 5432. Passwords must differ and contain 24–128 characters from `A-Z`, `a-z`, `0-9`, `_` or `-`. Automatic setup generates them; do not publish them. Never replace an initialized volume's passwords by generating a new environment file.

The container contains `vocabulary_local` and `vocabulary_local_test`. The runtime uses the limited `vocabulary_local_app` role. Migration/setup uses `vocabulary_local_migrator`. PostgreSQL 18 data is stored in `<project>_postgres-data`, mounted at `/var/lib/postgresql`.

## Isolation and recovery

The helper requires a local Docker socket/named pipe, Linux containers and Compose 2.20+. Before any host database connection, it checks the container's project/service labels, image, health, loopback port, named volume and expected configuration. It rejects remote Docker contexts. Inherited database URLs do not redirect this workflow.

A second checkout does not create an independent environment by itself. Follow the [English](INSTALL_WINDOWS.md#second-checkout-on-the-same-computer) or [Turkish](INSTALL_WINDOWS.tr.md#ayni-bilgisayarda-ikinci-kopya) second-checkout procedure before running setup on the same computer.

`local:setup` generates Prisma Client and applies the existing migration files with `prisma migrate deploy`; it does not reset or seed the database. It then verifies the migration ledger and model tables. `local:stop` stops the configured container without removing its storage. Preserve the volume and private configuration when investigating failures. Do not use volume deletion, `db push` or database reset as a routine repair.

## Tests and optional services

`npm.cmd run local:test:integration` checks the dedicated test target, applies its migrations and runs API integration tests serially. It is not a command for a personal study database. Unit tests use mocked dependencies and need no database after `npm.cmd run prisma:generate -w apps/api`.

The local workflow sets `AUTH_MODE=dev`, disables external example sentences and Azure speech, and supplies no external API keys. Browser audio fallback depends on an available English voice. Optional provider output has its own attribution and usage conditions.

## Other configuration files

The root `.env.example` and `docker-compose.yml` are optional low-level conveniences, not the supported `local:*` workflow. The `apps/api` `db:up` and `db:down` scripts refer to that separate Compose file. Do not mix those commands with `local:*` or run them against an unfamiliar environment.

`apps/api/.env.example` describes separately provisioned connections. Runtime uses `DATABASE_URL`; migration tooling uses `MIGRATION_DATABASE_URL`; tests require independently verified test targets. No real environment file is distributed. `apps/web/.env.example` describes deployment/proxy paths; no browser setting may contain database credentials. Production authentication and hosting still require an agreed implementation.
