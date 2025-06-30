# Deployment & CI/CD

## Topology

Two environments, same Docker image, different VPS + different env:

| Env | Trigger | Target | Stripe keys |
|---|---|---|---|
| **dev** | push to `main` | dev VPS (e.g. `dev.yourdomain.com`) | test |
| **prod** | push tag `v*` or manual dispatch | prod VPS (e.g. `yourdomain.com`) | live |

CI pipeline:

```
┌───────────┐   ┌───────────────┐   ┌──────────────┐   ┌─────────────┐
│ git push  │──▶│ Build image   │──▶│ Push to GHCR │──▶│ SSH to VPS  │
│ main      │   │ (buildx)      │   │ (ghcr.io)    │   │ pull-deploy │
└───────────┘   └───────────────┘   └──────────────┘   └─────────────┘
                                                             │
                                                             ▼
                                                       smoke-test
                                                       /api/health
```

Rollback is automatic on health-check failure — `pull-deploy.sh` records the
previous image tag and swaps back if the new one doesn't pass health in 120s.

## First-time VPS bootstrap

On a fresh Ubuntu 24.04 VPS:

```bash
# SSH in as root
curl -fsSL https://raw.githubusercontent.com/clawb00t13-web/autoapply/main/scripts/bootstrap-vps.sh | bash
```

This installs Docker, opens the firewall, clones the repo to `/opt/autoapply`,
and sets up daily backups. Then:

1. **Fill `.env.production`**
   ```bash
   nano /opt/autoapply/.env.production
   ```
   Every empty field matters. For `DOMAIN` use the hostname that points at the
   VPS (e.g. `dev.yourdomain.com` for dev, `yourdomain.com` for prod).

2. **Authorize GitHub Actions SSH key**

   Generate a dedicated deploy key pair locally (do NOT reuse your personal key):
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/autoapply_deploy -N "" -C "autoapply-deploy"
   ```
   On the VPS, append the public half:
   ```bash
   cat ~/.ssh/autoapply_deploy.pub | ssh root@<VPS_IP> 'cat >> ~/.ssh/authorized_keys'
   ```
   The **private** key goes into GitHub secrets (see below).

3. **Let the VPS pull from GHCR**

   Create a GitHub Personal Access Token (classic) with only `read:packages`
   scope. On the VPS:
   ```bash
   echo "<GHCR_PAT>" | docker login ghcr.io -u <github-username> --password-stdin
   ```
   Docker stores this in `/root/.docker/config.json` and reuses it for pulls.

4. **First deploy**

   From your dev machine (not CI):
   ```bash
   cd /opt/autoapply
   ./scripts/prod.sh --detach
   ```
   This builds locally on the VPS for the very first time. After this, all
   subsequent deploys come from CI via registry pull.

Repeat these 4 steps on the prod VPS.

## Configuring GitHub

The CI/CD flow uses **two GitHub Environments** (`dev` and `prod`) so the same
workflow can target different VPSes with different secrets. Each environment
can also have protection rules (manual approval for prod, etc).

### Create environments

1. Repo → Settings → Environments → **New environment** → `dev`
2. Repeat for `prod`
3. On `prod`, optionally enable **Required reviewers** so prod deploys require a click to approve

### Per-environment secrets

Add these to **each** environment (Settings → Environments → `<env>` → Add secret):

| Secret | What it is |
|---|---|
| `SSH_HOST` | VPS hostname or IP |
| `SSH_USER` | `root` or a deploy user |
| `SSH_KEY` | Contents of `~/.ssh/autoapply_deploy` (the private half) |
| `SSH_PORT` | Optional; defaults to `22` |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Baked into the client bundle at build time |
| `NEXT_PUBLIC_SENTRY_DSN` | Baked in |
| `NEXT_PUBLIC_POSTHOG_KEY` | Baked in |
| `NEXT_PUBLIC_POSTHOG_HOST` | Baked in |
| `NEXT_PUBLIC_APP_URL` | `https://dev.yourdomain.com` or `https://yourdomain.com` |

### Per-environment variables

Settings → Environments → `<env>` → Add variable:

| Variable | Value |
|---|---|
| `PUBLIC_URL` | `dev.yourdomain.com` or `yourdomain.com` (no protocol) |

### Repo-level secrets

None required — CI uses `GITHUB_TOKEN` automatically to push to GHCR.

### Make the package public (optional)

Per default GHCR images are private. If you want `docker pull` to work without
login (e.g. for debugging from another machine), visit:
`https://github.com/users/clawb00t13-web/packages/container/autoapply` →
Package settings → Change visibility → Public.

Keeping it private is fine — the VPS pulls using the PAT from Step 3 above.

## Deploy flow

### Dev
Push to `main` → `.github/workflows/deploy-dev.yml` fires → builds image tagged
`sha-<short>` and `dev-latest` → pushes to GHCR → SSHes dev VPS → runs
`pull-deploy.sh` → health-checks → done.

### Prod
Option A — tag release:
```bash
git tag v1.2.3
git push origin v1.2.3
```

Option B — manual dispatch (GitHub UI): Actions → "Deploy — prod" → Run
workflow. You can paste an existing image tag (e.g. `sha-abc1234`) to
redeploy a previously built image — useful for rolling back to a known-good
build without rebuilding.

### Hot-deploy from a specific commit
Actions → Deploy — dev → Run workflow. Pick the branch/commit. Same for prod
via manual dispatch.

## Observability

- `/api/health` — liveness/readiness (db + redis ping)
- Caddy access logs → `docker compose logs -f caddy`
- App logs → `docker compose logs -f app worker` (structured JSON in prod)
- Sentry captures errors with `userId` tags
- PostHog captures product events (`signed_up`, `campaign_created`, …)

## Rolling back

Automatic on failed health check. Manual:
```bash
# Find a known-good tag (GHCR page or: docker image ls | grep autoapply)
# Then on the VPS:
cd /opt/autoapply
IMAGE_TAG=sha-abc1234 ./scripts/pull-deploy.sh
```

Or from CI: Actions → "Deploy — prod" → Run workflow → paste the older tag.

## Common failure modes

| Symptom | Fix |
|---|---|
| CI fails at Docker login | Repo → Settings → Actions → **Workflow permissions** → "Read and write permissions" |
| VPS pull fails with `denied` | GHCR PAT expired or package visibility changed; re-run `docker login ghcr.io` |
| Health check times out after deploy | `docker compose logs app` on VPS — usually missing env var or DB connection |
| Caddy never gets a cert | DNS `A` record doesn't resolve to VPS IP, or port 80/443 blocked at cloud firewall |
| OAuth "redirect_uri_mismatch" | Update Google/LinkedIn OAuth app → add `https://<domain>/api/gmail/callback` |
| Stripe webhook 400 | `STRIPE_WEBHOOK_SECRET` in `.env.production` ≠ Stripe Dashboard signing secret |
