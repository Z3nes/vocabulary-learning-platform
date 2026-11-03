# Local Development Configuration

Start with the complete Windows guide: [English](INSTALL_WINDOWS.md) | [Türkçe](INSTALL_WINDOWS.tr.md).

Second checkout on the same computer: [English](#second-checkout-on-the-same-computer) | [Türkçe](#ayni-bilgisayarda-ikinci-kopya).

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

A second checkout does not create an independent environment by itself. Follow the [English](#second-checkout-on-the-same-computer) or [Turkish](#ayni-bilgisayarda-ikinci-kopya) second-checkout procedure before running setup on the same computer.

`local:setup` generates Prisma Client and applies the existing migration files with `prisma migrate deploy`; it does not reset or seed the database. It then verifies the migration ledger and model tables. `local:stop` stops the configured container without removing its storage. Preserve the volume and private configuration when investigating failures. Do not use volume deletion, `db push` or database reset as a routine repair.

<a id="second-checkout-on-the-same-computer"></a>

## Second checkout on the same computer

Türkçe: [Aynı bilgisayarda ikinci kopya](#ayni-bilgisayarda-ikinci-kopya)

Use this procedure only when another checkout of this project already uses the local Docker setup on this computer. Run it in the **new** checkout after `npm.cmd ci` and **before** `npm.cmd run local:setup`, then return to section 8 of the [Windows guide](INSTALL_WINDOWS.md).

The default Compose project is `vocabulary-local`, independent of the checkout directory. Reusing that name can target the same container and volume. Do not copy another checkout's real `.env.docker` or use its passwords.

Inspect existing names and occupied ports without printing container environments:

```powershell
docker ps -a --format '{{.Names}}'
docker volume ls --format '{{.Name}}'
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 5434,3001,5174 }
```

The example below is suitable only if the `vocabulary-local-second` project/volume and those ports are unused. Otherwise choose another permitted project suffix (see the [settings table](#supported-workflow)) and three free ports. Run it in the **new** checkout; it refuses to replace an existing `.env.docker` and generates new random passwords:

```powershell
if (Test-Path -LiteralPath .\.env.docker) { throw 'Existing .env.docker: inspect it privately before continuing.' }
$localConfig = Get-Content -LiteralPath .\.env.docker.example -Raw
$localConfig = $localConfig.Replace('LOCAL_COMPOSE_PROJECT=vocabulary-local', 'LOCAL_COMPOSE_PROJECT=vocabulary-local-second')
$localConfig = $localConfig.Replace('LOCAL_POSTGRES_PORT=5433', 'LOCAL_POSTGRES_PORT=5434')
$localConfig = $localConfig.Replace('LOCAL_API_PORT=3000', 'LOCAL_API_PORT=3001')
$localConfig = $localConfig.Replace('LOCAL_WEB_PORT=5173', 'LOCAL_WEB_PORT=5174')
$localMigratorPassword = node -p "require('node:crypto').randomBytes(32).toString('hex')"
$localAppPassword = node -p "require('node:crypto').randomBytes(32).toString('hex')"
$localConfig = $localConfig.Replace('REPLACE_MIGRATOR_PASSWORD', $localMigratorPassword)
$localConfig = $localConfig.Replace('REPLACE_APP_PASSWORD', $localAppPassword)
$localConfig | Set-Content -LiteralPath .\.env.docker -Encoding ascii
Remove-Variable localConfig,localMigratorPassword,localAppPassword
```

This creates a separate container and `vocabulary-local-second_postgres-data` volume when setup runs. Database names remain `vocabulary_local` and `vocabulary_local_test` **inside that separate PostgreSQL server**. They are not configurable names for an existing host database. The helper checks labels, credentials, port binding and named storage before applying migrations. A mismatch is a reason to stop and inspect, not to delete a container or volume.

With this example, open the application at `http://127.0.0.1:5174/` and use ports **3001** (API) and **5174** (web) instead of 3000 and 5173 in the health checks. Run `local:dev`, `local:stop` and `local:setup` for this environment from the new checkout only.

<a id="ayni-bilgisayarda-ikinci-kopya"></a>

## Aynı bilgisayarda ikinci kopya

English: [Second checkout on the same computer](#second-checkout-on-the-same-computer)

Bu yönergeleri yalnızca bu projenin başka bir kopyası bu bilgisayarda yerel Docker kurulumunu zaten kullanıyorsa izle. Komutları **yeni** proje kopyasında, `npm.cmd ci` komutundan sonra ve `npm.cmd run local:setup` komutundan **önce** çalıştır; ardından [Windows kılavuzunun](INSTALL_WINDOWS.tr.md) 8. bölümüne dön.

Varsayılan Compose proje adı, proje klasöründen bağımsız olarak `vocabulary-local` değeridir. Aynı adı kullanmak aynı container'ı ve veri birimini hedefleyebilir. Başka bir kopyanın gerçek `.env.docker` dosyasını veya parolalarını kopyalama.

Container ortam değişkenlerini yazdırmadan mevcut adları ve kullanılan portları incele:

```powershell
docker ps -a --format '{{.Names}}'
docker volume ls --format '{{.Name}}'
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 5434,3001,5174 }
```

Aşağıdaki örnek yalnızca `vocabulary-local-second` projesi/veri birimi ve belirtilen portlar kullanılmıyorsa uygundur. Kullanılıyorlarsa izin verilen farklı bir proje son eki ([ayarlar tablosuna](#supported-workflow) bak) ve üç boş port seç. Komutları **yeni** proje kopyasında çalıştır; mevcut `.env.docker` dosyasının üzerine yazmayı reddeder ve yeni rastgele parolalar üretir:

```powershell
if (Test-Path -LiteralPath .\.env.docker) { throw 'Existing .env.docker: inspect it privately before continuing.' }
$localConfig = Get-Content -LiteralPath .\.env.docker.example -Raw
$localConfig = $localConfig.Replace('LOCAL_COMPOSE_PROJECT=vocabulary-local', 'LOCAL_COMPOSE_PROJECT=vocabulary-local-second')
$localConfig = $localConfig.Replace('LOCAL_POSTGRES_PORT=5433', 'LOCAL_POSTGRES_PORT=5434')
$localConfig = $localConfig.Replace('LOCAL_API_PORT=3000', 'LOCAL_API_PORT=3001')
$localConfig = $localConfig.Replace('LOCAL_WEB_PORT=5173', 'LOCAL_WEB_PORT=5174')
$localMigratorPassword = node -p "require('node:crypto').randomBytes(32).toString('hex')"
$localAppPassword = node -p "require('node:crypto').randomBytes(32).toString('hex')"
$localConfig = $localConfig.Replace('REPLACE_MIGRATOR_PASSWORD', $localMigratorPassword)
$localConfig = $localConfig.Replace('REPLACE_APP_PASSWORD', $localAppPassword)
$localConfig | Set-Content -LiteralPath .\.env.docker -Encoding ascii
Remove-Variable localConfig,localMigratorPassword,localAppPassword
```

Kurulum çalıştığında ayrı bir container ve `vocabulary-local-second_postgres-data` veri birimi oluşturulur. Veritabanı adları **bu ayrı PostgreSQL sunucusu içinde** `vocabulary_local` ve `vocabulary_local_test` olarak kalır. Bunlar mevcut bir ana makine veritabanına yönlendirmek için değiştirilebilen adlar değildir. Yardımcı betik migration uygulamadan önce etiketleri, parolaları, port bağlamasını ve adlandırılmış veri birimini kontrol eder. Uyuşmazlık, durup incelemek için bir nedendir; container veya veri birimi silmek için değil.

Bu örnekte uygulamayı `http://127.0.0.1:5174/` adresinde aç; sağlık kontrollerinde 3000 ve 5173 yerine **3001** (API) ve **5174** (web) portlarını kullan. Bu ortam için `local:dev`, `local:stop` ve `local:setup` komutlarını yalnızca yeni proje kopyasından çalıştır.

## Tests and optional services

`npm.cmd run local:test:integration` checks the dedicated test target, applies its migrations and runs API integration tests serially. It is not a command for a personal study database. Unit tests use mocked dependencies and need no database after `npm.cmd run prisma:generate -w apps/api`.

The local workflow sets `AUTH_MODE=dev`, disables external example sentences and Azure speech, and supplies no external API keys. Browser audio fallback depends on an available English voice. Optional provider output has its own attribution and usage conditions.

## Other configuration files

The root `.env.example` and `docker-compose.yml` are optional low-level conveniences, not the supported `local:*` workflow. The `apps/api` `db:up` and `db:down` scripts refer to that separate Compose file. Do not mix those commands with `local:*` or run them against an unfamiliar environment.

`apps/api/.env.example` describes separately provisioned connections. Runtime uses `DATABASE_URL`; migration tooling uses `MIGRATION_DATABASE_URL`; tests require independently verified test targets. No real environment file is distributed. `apps/web/.env.example` describes deployment/proxy paths; no browser setting may contain database credentials. Production authentication and hosting still require an agreed implementation.
