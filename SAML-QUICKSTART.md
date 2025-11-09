# PigeonIdP - SAML Usage Guide

## What is SAML?

**SAML (Security Assertion Markup Language)** is an XML-based standard for Single Sign-On (SSO). It allows users to authenticate once with an Identity Provider (IdP) and access multiple Service Providers (SPs) without re-entering credentials.

## How PigeonIdP Works as SAML IdP

```
┌─────────────┐          ┌──────────────┐          ┌──────────────┐
│             │          │              │          │              │
│   User      │◄────────►│  PigeonIdP   │◄────────►│   Service    │
│  Browser    │   SAML   │  (Identity   │   SAML   │   Provider   │
│             │ Messages │   Provider)  │ Metadata │ (Salesforce, │
│             │          │              │          │  AWS, etc.)  │
└─────────────┘          └──────────────┘          └──────────────┘
```

## Quick Start Guide

### 1. Deploy PigeonIdP

```bash
# Clone the repository
git clone https://github.com/PeerPigeon/PigeonIdP
cd PigeonIdP

# Install dependencies
npm install

# Deploy to Fly.io (no prompts!)
npm run deploy
```

Your IdP is now live at: **https://pigeonidp.fly.dev**

### 2. Get Metadata URL

Share this with Service Providers:

```
https://pigeonidp.fly.dev/saml/metadata
```

### 3. Configure Service Provider

Example for **Salesforce**:

1. Setup → Single Sign-On Settings
2. Click "New from Metadata File"
3. Enter URL: `https://pigeonidp.fly.dev/saml/metadata`
4. Save

Example for **AWS**:

1. IAM → Identity Providers → Create Provider
2. Provider Type: SAML
3. Provider Name: PigeonIdP
4. Metadata Document: Upload from URL above

### 4. Test SSO

1. Go to your Service Provider
2. Click "Sign in with SSO" or your organization's SSO link
3. You're redirected to PigeonIdP login
4. Enter credentials
5. Automatically signed into Service Provider

## SAML Endpoints

Your deployed IdP exposes these endpoints:

| Endpoint | Purpose |
|----------|---------|
| `GET /saml/metadata` | IdP metadata XML for SP configuration |
| `GET /saml/sso` | Single Sign-On endpoint (receives auth requests) |
| `POST /saml/sso` | Processes authentication and returns SAML response |

## Programmatic Usage

### Generate SAML Assertions

```javascript
import { PigeonIdP } from 'pigeonidp';
import { PigeonIdPSAML } from 'pigeonidp/saml';

// Setup
const idp = new PigeonIdP({ namespace: 'production' });
await idp.init();
await idp.createIdentity('admin');

const saml = new PigeonIdPSAML(idp, {
  entityId: 'https://pigeonidp.fly.dev',
  ssoUrl: 'https://pigeonidp.fly.dev/saml/sso'
});

// Create user with attributes
const user = {
  id: 'alice@company.com',
  username: 'alice',
  attributes: {
    email: 'alice@company.com',
    firstName: 'Alice',
    lastName: 'Smith',
    roles: ['developer', 'admin'],
    department: 'Engineering'
  }
};

// Generate SAML assertion
const result = await saml.generateAssertion(
  user,
  'https://app.example.com/acs',  // SP's ACS URL
  'https://app.example.com'        // SP's Entity ID
);

console.log('Assertion:', result.assertion);
console.log('Signature:', result.signature);
```

### Generate Complete Response

```javascript
const samlResponse = await saml.generateResponse(
  user,
  'https://app.example.com/acs',
  'https://app.example.com',
  '_request_abc123'
);

// Base64 encoded response ready to POST to SP
console.log(samlResponse);
```

## Configuration

### Environment Variables

Edit `fly.toml` to customize:

```toml
[env]
  NAMESPACE = "my-organization"
  IDP_ENTITY_ID = "https://sso.mycompany.com"
  IDP_SSO_URL = "https://sso.mycompany.com/saml/sso"
  ORG_NAME = "My Company"
  CONTACT_EMAIL = "it@mycompany.com"
  ASSERTION_LIFETIME = "300"
```

Then redeploy:

```bash
npm run deploy
```

## User Attributes

SAML assertions can include these attributes:

```javascript
attributes: {
  email: 'user@example.com',       // Email address
  firstName: 'John',                // First name
  lastName: 'Doe',                  // Last name
  displayName: 'John Doe',          // Full name
  roles: ['admin', 'user'],         // User roles
  groups: ['engineering'],          // User groups
  department: 'Engineering',        // Department
  title: 'Senior Developer',        // Job title
  phone: '+1-555-0123',            // Phone number
  employeeId: 'EMP001'             // Employee ID
}
```

Service Providers map these to their user profiles.

## Common Service Providers

### Salesforce
- Metadata URL: `https://pigeonidp.fly.dev/saml/metadata`
- NameID: Email address
- Attribute Mapping: Standard SAML attributes

### Google Workspace
- Sign-in URL: `https://pigeonidp.fly.dev/saml/sso`
- Certificate: From metadata
- NameID: Email address

### AWS IAM
- Provider Type: SAML
- Metadata: Upload from URL
- Roles: Map to SAML attributes

### Azure AD
- Identifier: `https://pigeonidp.fly.dev`
- Reply URL: From metadata
- Sign-on URL: `https://pigeonidp.fly.dev/saml/sso`

## Testing

### Run Example

```bash
node examples/saml-example.js
```

This demonstrates:
- Creating IdP
- Setting up SAML
- Generating metadata
- Creating assertions
- Generating responses

### Test with SAMLTest.id

1. Go to https://samltest.id
2. Upload your IdP metadata
3. Test SSO flow

### Use Browser Extension

Install **SAML-tracer** to debug SAML messages in real-time.

## Security

✅ **All assertions are cryptographically signed** using UnSEA  
✅ **HTTPS required** (provided by Fly.io)  
✅ **Time-limited assertions** (default: 5 minutes)  
✅ **Audience restrictions** (scoped to specific SPs)  
✅ **Signature verification** by Service Providers

## Troubleshooting

### "Invalid signature"
- Verify SP has correct metadata
- Check certificate matches
- Ensure time synchronization

### "Assertion expired"
- Increase `ASSERTION_LIFETIME`
- Check system clocks

### "Invalid audience"
- Verify SP Entity ID matches
- Update SP configuration

### View Logs

```bash
npm run logs
# or
flyctl logs --app pigeonidp
```

## Documentation

- **[README.md](README.md)** - Full API documentation
- **[SAML.md](SAML.md)** - Complete SAML guide
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Deployment instructions
- **[examples/saml-example.js](examples/saml-example.js)** - Working code example

## What You Can Do

✅ **Implement SSO** for your organization  
✅ **Integrate with enterprise apps** (Salesforce, AWS, Google, etc.)  
✅ **Centralize identity management** across services  
✅ **Deploy in minutes** with one command  
✅ **Customize attributes** for each user  
✅ **Run on free tier** (Fly.io free plan)  

## Next Steps

1. **Deploy**: `npm run deploy`
2. **Test**: Run examples and test with SAMLTest.id
3. **Configure**: Add your first Service Provider
4. **Customize**: Adjust attributes and settings
5. **Production**: Set up custom domain and user management

## Support

- **Issues**: https://github.com/PeerPigeon/PigeonIdP/issues
- **Docs**: Complete documentation in repository
- **Examples**: Working code in `/examples` directory

---

**You now have a production-ready SAML Identity Provider!** 🎉
