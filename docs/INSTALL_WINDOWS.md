[English](INSTALL_WINDOWS.md) | [Türkçe](INSTALL_WINDOWS.tr.md)

# Windows Installation

This guide runs the frontend and API on Windows and PostgreSQL in Docker. It is a local development setup with a shared demo identity, not a public deployment. PostgreSQL and pgAdmin do not need separate installation.

Use a Windows version supported by [Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/), with hardware virtualization available. Installation may request administrator permission and a restart. Run project commands in normal PowerShell from your own project directory, not from `C:\Windows\System32`.

## 1. Choose installation methods

Each prerequisite below has an official download method and a PowerShell method. Choose one method per tool. `winget` is Windows Package Manager; check it with `winget --version`. If it is unavailable, use the official installers or Microsoft's [App Installer instructions](https://learn.microsoft.com/en-us/windows/package-manager/winget/).

Open a new PowerShell window after installing command-line tools so it sees the updated PATH. Do not install all prerequisites again if the version checks already succeed.

## 2. Node.js 24

The project accepts Node.js **24.x, at least 24.11.0 and below 25**, and rejects other major versions through `engine-strict`. This guide pins **24.14.0** to match the verification environment. It is a reproducible reference, not a claim to be the newest Node.js 24 release. Newer 24.x patches can be reviewed against the [official Node.js 24 archive](https://nodejs.org/download/release/latest-v24.x/).

**A. Official download:** open the [24.14.0 release archive](https://nodejs.org/download/release/v24.14.0/). Use `node-v24.14.0-x64.msi` for an ordinary 64-bit Intel/AMD PC or the ARM64 MSI for an ARM PC. The installer includes npm. Keep the PATH option enabled; optional unrelated development tools are not required by this guide.

**B. PowerShell / WinGet:** this exact version is present in the [Microsoft WinGet manifest](https://raw.githubusercontent.com/microsoft/winget-pkgs/master/manifests/o/OpenJS/NodeJS/LTS/24.14.0/OpenJS.NodeJS.LTS.installer.yaml). Check the current catalog, then install:

```powershell
winget show --id OpenJS.NodeJS.LTS --exact --source winget --versions
winget install --id OpenJS.NodeJS.LTS --exact --source winget --version 24.14.0 --installer-type wix
```

If the version is unavailable in your catalog, use method A. Do not remove the version flag and accidentally install a different Node major. [WinGet's version option](https://learn.microsoft.com/en-us/windows/package-manager/winget/install) selects a specific release.

If Node.js 26 is already installed, use your existing version manager to select Node 24, or uninstall Node.js 26 through Windows **Settings → Apps → Installed apps**, then install 24.14.0. Do not uninstall a version needed by another project without planning its replacement. `.nvmrc` documents the desired major; it does not switch versions by itself. If a version manager is already installed, avoid mixing it with a second MSI installation.

Verify in a new PowerShell window:

```powershell
node --version
npm.cmd --version
Get-Command node | Select-Object Source
```

For the pinned installer, Node should report `v24.14.0`. If it still reports 26, check the displayed executable location and select the intended installation before continuing.

## 3. Git

**A. Official download:** install [Git for Windows](https://git-scm.com/install/windows), making Git available from command-line programs.

**B. PowerShell / WinGet:**

```powershell
winget install --id Git.Git --exact --source winget
```

Open a new PowerShell window and verify:

```powershell
git --version
```

## 4. WSL 2

Docker's WSL 2 backend needs WSL; a separate Ubuntu distribution is **not** required. Docker can run Linux containers from Windows PowerShell without a user-installed distribution. See [Docker's WSL documentation](https://docs.docker.com/desktop/features/wsl/).

First check:

```powershell
wsl --version
wsl --status
```

If WSL is already current and working, continue to Docker. If it is absent or incomplete, use either method:

**A. Official download:** use the stable MSI for your architecture from [Microsoft's WSL releases](https://github.com/microsoft/WSL/releases), following Microsoft's [installation instructions](https://learn.microsoft.com/en-us/windows/wsl/install) for the required Windows components.

**B. Administrator PowerShell:** right-click PowerShell and choose **Run as administrator**, then run:

```powershell
wsl --install --no-distribution
```

Restart Windows when requested. For an existing installation that needs an update:

```powershell
wsl --update
```

Run `wsl --version` and `wsl --status` again. Docker currently requires WSL 2.1.5 or later; check its requirements if installation reports a higher minimum. A message that no user Linux distribution is installed does not by itself require installing Ubuntu. The [`--no-distribution` option](https://learn.microsoft.com/en-us/windows/wsl/basic-commands) deliberately skips that step.

## 5. Docker Desktop

**A. Official download:** use [Docker Desktop for Windows](https://docs.docker.com/desktop/setup/install/windows-install/) and select the installer for your architecture.

**B. PowerShell / WinGet:**

```powershell
winget install --id Docker.DockerDesktop --exact
```

Review the installer's terms and prompts yourself. Open **Docker Desktop** from the Start menu after installation; installing the CLI alone does not start the Engine. Use **Linux containers** and the **WSL 2 based engine** setting when shown. Wait for the Engine to finish starting.

Verify from a new PowerShell window:

```powershell
docker --version
docker compose version
docker info --format '{{.ServerVersion}}'
docker info --format '{{.OSType}}'
```

The server-version command must return a version, not a connection error; the OS type must be `linux`. Compose must be version 2.20 or newer. Successful `docker --version` alone verifies only the client.

## 6. Clone into your home directory

Use normal PowerShell:

```powershell
Set-Location $env:USERPROFILE
git clone https://github.com/Z3nes/vocabulary-learning-platform.git
Set-Location .\vocabulary-learning-platform
Get-Location
```

The resulting folder should be inside your own home directory. Do not clone into `C:\Windows\System32`. If the destination already exists, inspect it or choose another empty directory; do not delete an existing checkout to make cloning succeed. While the repository is private, you need permission to access it. Use GitHub's normal authentication flow and never embed a token in the URL.

## 7. Install project dependencies

Run from the folder containing `package.json`:

```powershell
npm.cmd ci
```

`ci` installs the versions in `package-lock.json`. It requires network access on a fresh machine. We use `npm.cmd` because PowerShell may block `npm.ps1` under its execution policy. You do not need to weaken the execution policy or run `Set-ExecutionPolicy` for these commands.

<a id="second-checkout-on-the-same-computer"></a>

> [!IMPORTANT]
> **Installing this project for the first time on this computer?** Continue directly to section 8.
>
> **Does another checkout of this project already use the local Docker setup on this computer?** Stop here. A new folder does not create a separate database; both checkouts can target the same container and data. Configure an isolated environment **before** running `local:setup` by following [Second checkout on the same computer](LOCAL_DEVELOPMENT.md#second-checkout-on-the-same-computer).

## 8. Set up the database and start the application

Keep Docker Desktop running:

```powershell
npm.cmd run local:setup
npm.cmd run local:dev
```

The first command creates `.env.docker` with independent random passwords if absent, starts PostgreSQL 18.6 on loopback, generates Prisma Client, applies migrations and verifies the schema. Existing environment files are not overwritten, and no vocabulary is seeded or imported. The first image download can take several minutes.

The current script's successful output includes these exact lines:

```text
[local] vocabulary_local: 10 migrations and 13 model tables verified.
[local] Prisma Client generated; local database ready. Run npm run local:dev.
```

These lines describe expected output, not an installation screenshot. A migration count change in a later release should be checked against its migration directory.

`local:dev` verifies the schema again and starts the API and frontend. With defaults, it prints:

```text
[local] Local demo identity only. Web: http://127.0.0.1:5173/
```

Open [the dashboard](http://127.0.0.1:5173/), create a list and add your own words. In another PowerShell window, these default-port checks confirm the servers:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health
Invoke-RestMethod http://127.0.0.1:5173/api/health/db
```

Expect `status: ok` and `database: reachable`. Use your configured ports if changed. The `/dev/status` page also displays local API/database status. Do not send these requests to an unrelated program occupying the default ports.

## 9. Stop and restart

Press **Ctrl+C** in the window running `local:dev` to stop web/API processes. Then run from the same checkout:

```powershell
npm.cmd run local:stop
```

This stops its PostgreSQL container and preserves its named volume, lists and study history. Keep `.env.docker` private and retain its original passwords. To restart after stopping the database:

```powershell
npm.cmd run local:setup
npm.cmd run local:dev
```

If the database is still running and the schema is current, `local:dev` is sufficient. Use the same checkout/configuration for stopping and restarting.

## 10. Tests

See [README testing commands](../README.md#testing). Unit tests do not need a running database after Prisma Client has been generated. `npm.cmd run local:test:integration` requires your own verified Docker environment and uses its dedicated test database. Never substitute a personal database connection for a test target.

## 11. Troubleshooting

| Problem                                          | What to check                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wrong Node version / `EBADENGINE`                | Run `node --version` and `Get-Command node`. Select Node 24.x ≥24.11.0, reopen PowerShell and retry `npm.cmd ci`. Do not disable `engine-strict`.                                                                                                                                                              |
| Git clone permission denied                      | Confirm `Get-Location` is your home directory. For an authentication error, confirm access to the repository and use normal GitHub sign-in. Do not elevate Git just to write into a system folder.                                                                                                             |
| Docker command not found                         | Finish Docker Desktop installation, reopen PowerShell and run `Get-Command docker`. Use the official installer if WinGet was unavailable.                                                                                                                                                                      |
| Docker Engine will not start                     | Open Docker Desktop, inspect its error, verify WSL status and hardware virtualization, and complete requested restarts. Check the official Docker troubleshooting information; do not factory-reset or delete data as a first step.                                                                            |
| WSL missing or incomplete                        | Run `wsl --version` and `wsl --status`; use Administrator PowerShell for `wsl --install --no-distribution` when absent. Update an existing WSL with `wsl --update`, and restart if requested.                                                                                                                  |
| Port 5433, 3000 or 5173 already occupied         | Identify the owning program. For an additional isolated checkout, follow the [second-checkout instructions](LOCAL_DEVELOPMENT.md#second-checkout-on-the-same-computer) with a distinct project, volume and unused ports. Do not stop an unknown database or change the ports of a populated container blindly. |
| `npm.ps1` cannot be loaded                       | Use `npm.cmd` (and `npx.cmd` when needed). No system execution-policy change is required.                                                                                                                                                                                                                      |
| Prisma authentication, migration or schema error | Keep the original `.env.docker` passwords. Review the reported Prisma code, migration name and container identity. Do not reset, run `db push`, edit applied migrations or remove a volume. Seek help with redacted error details.                                                                             |
| Frontend or API does not start                   | Confirm `npm.cmd ci` and `local:setup` completed, Docker's server-version check succeeds, and the configured ports are free. Start with `npm.cmd run local:dev` from the project root; inspect both process outputs.                                                                                           |
| Image download or package download fails         | Check network/proxy access to Docker's registry or npm; retry the same command after fixing connectivity. Do not change the lockfile or database credentials as a network workaround.                                                                                                                          |
| No listening audio                               | The default setup disables Azure. Browser fallback requires a usable English voice; use the UI's unavailable-audio flow if the browser has none.                                                                                                                                                               |

Do not post real environment files, unredacted Docker inspection output, database URLs or personal vocabulary in support requests. Never delete Docker volumes or reset databases as a routine fix.
