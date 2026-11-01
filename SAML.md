# Using PigeonIdP as a SAML Identity Provider

PigeonIdP implements SAML 2.0 (Security Assertion Markup Language) to enable Single Sign-On (SSO) with enterprise applications and service providers.

## What is SAML?

SAML is an XML-based standard for exchanging authentication and authorization data between an Identity Provider (IdP) and Service Providers (SP). It enables:

- **Single Sign-On (SSO)** - Users authenticate once and access multiple applications
- **Enterprise Integration** - Works with Salesforce, Google Workspace, AWS, Azure AD, etc.
- **Federated Identity** - Centralized identity management across organizations
- **Security** - Cryptographically signed assertions

## Quick Start

### 1. Run the PigeonIdP Server

```bash
IDP_ENTITY_ID=https://idp.example.com npm start
```

Serve it over HTTPS at that address (`https://idp.example.com` stands for yours throughout this guide).

### 2. Get IdP Metadata

Share this URL with Service Providers:

```
https://idp.example.com/saml/metadata
```

Or download it:

```bash
curl https://idp.example.com/saml/metadata > idp-metadata.xml
```

### 3. Configure Service Provider

In your Service Provider (e.g., Salesforce, AWS):

1. Upload the IdP metadata XML
2. Or manually configure:
   - **Entity ID**: `https://idp.example.com`
   - **SSO URL**: `https://idp.example.com/saml/sso`
   - **Binding**: HTTP-POST or HTTP-Redirect
   - **NameID Format**: Unspecified

### 4. Test SSO

1. Navigate to your Service Provider
2. Click "Sign in with SAML" or your SSO link
3. You'll be redirected to PigeonIdP login page
4. Enter credentials
5. Automatically redirected back to SP with access

## SAML Endpoints

### Metadata Endpoint

```
GET /saml/metadata
```

Returns IdP metadata XML for SP configuration.

**Response**: XML document with IdP configuration

**Example**:
```bash
curl https://idp.example.com/saml/metadata
```


### Single Sign-On Endpoint

```
GET /saml/sso?SAMLRequest={base64}&RelayState={optional}
POST /saml/sso
```

Handles SAML authentication requests.

**GET** - Receives SAMLRequest via HTTP-Redirect binding  
**POST** - Processes login and returns SAMLResponse

## Using the SAML API

### Programmatic Usage

```javascript
import { PigeonIdP } from 'pigeonidp';
import { PigeonIdPSAML } from 'pigeonidp/saml';

// Create IdP
const idp = new PigeonIdP({
  namespace: 'my-org'
});
await idp.init();
await idp.createIdentity('admin');

// Add SAML support
const saml = new PigeonIdPSAML(idp, {
  entityId: 'https://myidp.example.com',
  ssoUrl: 'https://myidp.example.com/saml/sso',
  organizationName: 'My Organization',
  contactEmail: 'admin@example.com'
});

// Generate SAML assertion
const user = {
  id: 'alice@example.com',
  username: 'alice',
  attributes: {
    email: 'alice@example.com',
    firstName: 'Alice',
    lastName: 'Smith',
    roles: ['admin', 'developer']
  }
};

const result = await saml.generateAssertion(
  user,
  'https://sp.example.com/acs',  // SP's Assertion Consumer Service URL
  'https://sp.example.com'        // SP's Entity ID
);

console.log('Assertion:', result.assertion);
console.log('Signature:', result.signature);
```

### Generate Complete SAML Response

```javascript
const samlResponse = await saml.generateResponse(
  user,
  'https://sp.example.com/acs',
  'https://sp.example.com',
  '_request_abc123' // InResponseTo from AuthnRequest
);

// samlResponse is base64 encoded and ready to POST to SP
```

### Get IdP Metadata

```javascript
const metadata = saml.getMetadata();
console.log(metadata);
```

## Testing SAML Integration

### Test Assertion Generation

```bash
curl -X POST https://idp.example.com/saml/test/assertion \
  -H "Content-Type: application/json" \
  -d '{
    "user": {
      "id": "test@example.com",
      "username": "test",
      "attributes": {
        "email": "test@example.com",
        "name": "Test User"
      }
    },
    "recipient": "https://sp.example.com/acs",
    "audience": "https://sp.example.com"
  }'
```

### Online SAML Testing Tools

Test your IdP with these tools:

- **SAMLTest.id**: https://samltest.id
- **SAML-Tracer** (Browser Extension): Debug SAML messages
- **OneLogin SAML Dev Tools**: https://www.samltool.com/

## Common Service Provider Configurations

### Salesforce

1. Setup → Identity → Single Sign-On Settings
2. Click "New from Metadata File"
3. Upload PigeonIdP metadata XML
4. Configure:
   - Entity ID: `https://idp.example.com`
   - Name ID Format: Unspecified
   - Identity Location: Subject

### AWS IAM

1. IAM Console → Identity Providers → Create Provider
2. Provider Type: SAML
3. Provider Name: PigeonIdP
4. Upload metadata XML
5. Create roles and map to SAML attributes

### Google Workspace

1. Admin Console → Security → Authentication → SSO with third-party IdP
2. Setup SSO:
   - Sign-in page URL: `https://idp.example.com/saml/sso`
   - Sign-out page URL: `https://idp.example.com/saml/logout`
   - Upload certificate from metadata
3. Test with users

### Azure AD (Enterprise Application)

1. Azure Portal → Enterprise Applications → New Application
2. Create your own application → Non-gallery
3. Setup SAML:
   - Upload metadata file
   - Set Identifier and Reply URL from metadata
4. Assign users

## SAML Attributes

PigeonIdP can send these user attributes to Service Providers:

```javascript
{
  email: 'user@example.com',
  firstName: 'John',
  lastName: 'Doe',
  displayName: 'John Doe',
  roles: ['admin', 'user'],
  groups: ['engineering', 'management'],
  department: 'Engineering',
  title: 'Senior Developer'
}
```

Service Providers can map these to their internal user properties.

## Security Considerations

### Assertion Signing

All SAML assertions are cryptographically signed using UnSEA:

```javascript
const { assertion, signature } = await saml.generateAssertion(user, ...);
```

Service Providers verify signatures using the public key in the metadata.

### Assertion Lifetime

Configure how long assertions are valid:

```javascript
const saml = new PigeonIdPSAML(idp, {
  assertionLifetime: 300 // 5 minutes (default)
});
```

### Audience Restriction

Assertions are scoped to specific Service Providers:

```xml
<saml:AudienceRestriction>
  <saml:Audience>https://sp.example.com</saml:Audience>
</saml:AudienceRestriction>
```

### HTTPS Required

SAML requires HTTPS in production: run the server behind a TLS-terminating proxy or load balancer.

## Environment Variables

Configure SAML with environment variables when starting the server:

```bash
IDP_ENTITY_ID="https://myidp.example.com" \
IDP_SSO_URL="https://myidp.example.com/saml/sso" \
ORG_NAME="My Organization" \
CONTACT_EMAIL="admin@example.com" \
ASSERTION_LIFETIME="300" \
npm start
```

## Example: Full SAML Flow

```javascript
// examples/saml-example.js
import { PigeonIdP } from 'pigeonidp';
import { PigeonIdPSAML } from 'pigeonidp/saml';

async function main() {
  // 1. Setup IdP
  const idp = new PigeonIdP({ namespace: 'production' });
  await idp.init();
  await idp.createIdentity('admin');
  
  // 2. Configure SAML
  const saml = new PigeonIdPSAML(idp, {
    entityId: 'https://idp.example.com',
    ssoUrl: 'https://idp.example.com/saml/sso'
  });
  
  // 3. User authentication happens...
  
  // 4. Generate response for authenticated user
  const user = {
    id: 'alice@company.com',
    username: 'alice',
    attributes: {
      email: 'alice@company.com',
      firstName: 'Alice',
      lastName: 'Smith',
      roles: ['developer']
    }
  };
  
  const samlResponse = await saml.generateResponse(
    user,
    'https://app.example.com/acs',
    'https://app.example.com',
    '_request_xyz'
  );
  
  // 5. POST response back to Service Provider
  // (Automatically handled by server.js)
  
  await idp.disconnect();
}

main();
```

Run the example:

```bash
node examples/saml-example.js
```

## Troubleshooting

### "SAML Response signature validation failed"

- Ensure Service Provider has correct metadata
- Verify certificate/public key matches
- Check system time synchronization

### "Assertion expired"

- Increase `assertionLifetime` setting
- Verify system clocks are synchronized
- Check timezone configurations

### "Audience restriction mismatch"

- Ensure SP Entity ID matches audience in assertion
- Update SP configuration to match

### Enable Debug Logging

```bash
DEBUG=* node server.js
```

## Resources

- **SAML 2.0 Specification**: http://docs.oasis-open.org/security/saml/
- **PigeonIdP Documentation**: README.md
- **Example Code**: examples/saml-example.js

## Support

- Issues: https://github.com/PeerPigeon/PigeonIdP/issues
- Discussions: https://github.com/PeerPigeon/PigeonIdP/discussions
- Email: admin@pigeonidp.example.com

---

**Next Steps**:
1. Run your IdP: `npm start`
2. Test with SAMLTest.id
3. Configure your first Service Provider
4. Set up user authentication
5. Go to production! 🚀
