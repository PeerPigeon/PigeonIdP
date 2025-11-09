# First-Time Deployment Guide

## Before You Deploy

### 1. Choose a Unique App Name

Edit `fly.toml` and change the app name on line 6:

```toml
app = 'your-company-idp'  # Change this to your unique name
```

**Examples of good app names:**
- `acme-idp`
- `mycompany-sso`
- `engineering-idp`
- `dev-identity-provider`

**Important**: The app name must be globally unique across all Fly.io applications.

### 2. Customize Configuration (Optional)

In `fly.toml`, you can also customize:

```toml
[env]
  NAMESPACE = 'your-organization'
  SIGNALING_SERVERS = 'wss://pigeonhub.fli.dev'
  ORG_NAME = 'Your Company Name'
  CONTACT_EMAIL = 'it@yourcompany.com'
```

## Deploy

### Install Fly CLI

If you haven't already:

```bash
# macOS
brew install flyctl

# Windows (PowerShell)
iwr https://fly.io/install.ps1 -useb | iex

# Linux
curl -L https://fly.io/install.sh | sh
```

### Login to Fly.io

```bash
flyctl auth login
```

### Deploy Your IdP

```bash
# Install dependencies
npm install

# Deploy (no prompts!)
npm run deploy
```

That's it! Your IdP is now live at: `https://your-app-name.fly.dev`

## Verify Deployment

Check that your IdP is running:

```bash
# Check status
npm run status

# View logs
npm run logs

# Test health endpoint
curl https://your-app-name.fly.dev/health
```

## Your SAML URLs

After deployment, you'll have these URLs (replace `your-app-name`):

- **IdP Metadata**: `https://your-app-name.fly.dev/saml/metadata`
- **SSO URL**: `https://your-app-name.fly.dev/saml/sso`
- **Entity ID**: `https://your-app-name.fly.dev`

Share the metadata URL with your Service Providers (Salesforce, AWS, etc.).

## Update Your Deployment

Make changes, then:

```bash
npm run deploy
```

## Common Issues

### "App name already taken"

Change the app name in `fly.toml` to something more unique.

### "Not logged in"

Run: `flyctl auth login`

### "Permission denied"

Make sure you have access to create apps in your Fly.io organization.

## Next Steps

1. ✅ Deploy your IdP
2. 📋 Share metadata URL with Service Providers
3. 🔐 Configure your first SAML integration
4. 📚 Read [SAML.md](SAML.md) for detailed configuration
5. 🚀 Set up GitHub Actions for automatic deployments (see [DEPLOYMENT.md](DEPLOYMENT.md))

## Support

- **Deployment issues**: [DEPLOYMENT.md](DEPLOYMENT.md)
- **SAML configuration**: [SAML.md](SAML.md)
- **API documentation**: [README.md](README.md)
- **GitHub Issues**: https://github.com/PeerPigeon/PigeonIdP/issues
