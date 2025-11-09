# Deploying PigeonIdP to Fly.io

This guide will help you deploy a PigeonIdP server to Fly.io.

## Prerequisites

1. Install the Fly CLI: https://fly.io/docs/hands-on/install-flyctl/
2. Sign up for a Fly.io account: https://fly.io/app/sign-up
3. Authenticate: `flyctl auth login`

## Quick Start

### 1. Install Dependencies Locally (Optional)

```bash
npm install
```

### 2. Deploy (Non-Interactive)

The easiest way to deploy without prompts:

```bash
npm run deploy
```

Or use the deployment script:

```bash
./deploy.sh
```

Or deploy manually with automatic yes:

```bash
flyctl deploy --yes --ha=false
```

### 3. First Time Setup (Interactive)

If you need to create the app for the first time:

```bash
flyctl launch --yes --now
```

This will:
- Detect the Dockerfile
- Use the existing `fly.toml` configuration
- Create a new app on Fly.io
- Deploy your application automatically

## Configuration

### Environment Variables

The server uses these environment variables (configured in `fly.toml`):

- `NAMESPACE` - The namespace for this IdP instance (default: `pigeonidp-server`)
- `SIGNALING_SERVERS` - Comma-separated list of WebRTC signaling servers (default: `wss://pigeonhub.fli.dev`)
- `PORT` - Port to listen on (automatically set by Fly.io to 3000)

### Custom Configuration

Edit `fly.toml` to customize:

```toml
[env]
  NAMESPACE = "my-custom-namespace"
  SIGNALING_SERVERS = "wss://server1.example.com,wss://server2.example.com"
```

Then redeploy (non-interactive):

```bash
npm run deploy
```

Or with flyctl:

```bash
flyctl deploy --yes
```

### Scaling

Adjust resources in `fly.toml`:

```toml
[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 512  # Increase memory if needed
```

Or use the CLI:

```bash
flyctl scale memory 512 --yes
flyctl scale count 2 --yes  # Run 2 instances
```

## NPM Scripts

The following npm scripts are available for easy deployment:

```bash
npm run deploy      # Deploy with no prompts (single instance)
npm run deploy:ha   # Deploy with high availability (2 instances)
npm run logs        # View application logs
npm run status      # Check app status
npm test            # Run tests
npm start           # Start server locally
```

## API Endpoints

Once deployed, your server will expose these endpoints:

### Health Check
```
GET https://your-app.fly.dev/health
```

### Server Info
```
GET https://your-app.fly.dev/api/info
```

### Lookup Identity
```
GET https://your-app.fly.dev/api/identity/:alias?namespace=optional
```

### Verify Signature
```
POST https://your-app.fly.dev/api/verify
Content-Type: application/json

{
  "message": "Hello World",
  "signature": "...",
  "publicKey": "..."
}
```

### Verify Auth Token
```
POST https://your-app.fly.dev/api/verify-token
Content-Type: application/json

{
  "token": "..."
}
```

### DHT Operations
```
POST https://your-app.fly.dev/api/dht/put
GET https://your-app.fly.dev/api/dht/get/:key
```

## Monitoring

### View Logs

```bash
flyctl logs
```

### Check Status

```bash
flyctl status
```

### View Metrics

```bash
flyctl dashboard
```

## Troubleshooting

### App Won't Start

Check logs:
```bash
flyctl logs
```

### Connection Issues

Verify the app is running:
```bash
flyctl status
curl https://your-app.fly.dev/health
```

### Update Configuration

```bash
flyctl secrets set NAMESPACE=new-namespace
flyctl deploy
```

## Custom Domain

Add a custom domain:

```bash
flyctl certs add yourdomain.com
```

Then add a DNS record:
```
CNAME yourdomain.com -> your-app.fly.dev
```

## Costs

Fly.io offers a free tier that includes:
- Up to 3 shared-cpu-1x VMs with 256MB RAM
- 3GB persistent volume storage
- 160GB outbound data transfer

The default configuration uses minimal resources and should fit within the free tier.

## Automated CI/CD with GitHub Actions

A GitHub Actions workflow is included at `.github/workflows/deploy.yml` that automatically deploys to Fly.io when you push to the `main` branch.

### Setup GitHub Actions:

1. Get your Fly.io API token:
   ```bash
   flyctl auth token
   ```

2. Add it to your GitHub repository secrets:
   - Go to your repo → Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Name: `FLY_API_TOKEN`
   - Value: (paste your token)

3. Push to main branch to trigger automatic deployment:
   ```bash
   git add .
   git commit -m "Deploy changes"
   git push origin main
   ```

The workflow will:
- Install dependencies
- Run tests
- Deploy to Fly.io (only if tests pass)

## Security Notes

1. The DHT PUT endpoint (`/api/dht/put`) is public - consider adding authentication if needed
2. All data in the P2P network is public by design
3. Consider rate limiting for production deployments
4. Enable HTTPS (automatically provided by Fly.io)

## Support

- Fly.io Docs: https://fly.io/docs/
- PigeonIdP Issues: https://github.com/PeerPigeon/PigeonIdP/issues
