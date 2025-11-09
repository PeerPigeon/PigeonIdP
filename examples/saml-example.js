/**
 * SAML Example for PigeonIdP
 * 
 * Demonstrates how to use PigeonIdP as a SAML 2.0 Identity Provider
 */

import { PigeonIdP } from '../index.js';
import { PigeonIdPSAML } from '../saml.js';

async function samlExample() {
  console.log('=== PigeonIdP SAML Example ===\n');

  // 1. Create and initialize IdP
  console.log('1. Creating PigeonIdP instance...');
  const idp = new PigeonIdP({
    namespace: 'saml-example',
    signalingServers: ['wss://pigeonhub.fli.dev']
  });

  await idp.init();
  console.log('✓ IdP initialized\n');

  // 2. Create identity
  console.log('2. Creating identity...');
  await idp.createIdentity('saml-user');
  console.log('✓ Identity created\n');

  // 3. Setup SAML extension
  console.log('3. Setting up SAML...');
  const saml = new PigeonIdPSAML(idp, {
    entityId: 'https://pigeonidp.fly.dev',
    ssoUrl: 'https://pigeonidp.fly.dev/saml/sso',
    organizationName: 'PigeonIdP',
    contactEmail: 'admin@pigeonidp.example.com',
    assertionLifetime: 300 // 5 minutes
  });
  console.log('✓ SAML configured\n');

  // 4. Generate IdP Metadata
  console.log('4. Generating IdP Metadata...');
  const metadata = saml.getMetadata();
  console.log('IdP Metadata (first 500 chars):');
  console.log(metadata.substring(0, 500) + '...\n');

  // 5. Generate SAML Assertion
  console.log('5. Generating SAML Assertion...');
  const user = {
    id: 'alice@example.com',
    username: 'alice',
    attributes: {
      email: 'alice@example.com',
      firstName: 'Alice',
      lastName: 'Smith',
      roles: ['user', 'developer']
    }
  };

  const assertionResult = await saml.generateAssertion(
    user,
    'https://sp.example.com/acs', // Service Provider ACS URL
    'https://sp.example.com'      // Service Provider Entity ID
  );

  console.log('SAML Assertion (first 500 chars):');
  console.log(assertionResult.assertion.substring(0, 500) + '...');
  console.log('Assertion ID:', assertionResult.assertionId);
  console.log('Signature:', assertionResult.signature.substring(0, 50) + '...\n');

  // 6. Generate complete SAML Response
  console.log('6. Generating complete SAML Response...');
  const samlResponse = await saml.generateResponse(
    user,
    'https://sp.example.com/acs',
    'https://sp.example.com',
    '_request_abc123' // InResponseTo from AuthnRequest
  );

  console.log('Base64 SAML Response (first 200 chars):');
  console.log(samlResponse.substring(0, 200) + '...\n');

  // 7. Show how this would be used in a real scenario
  console.log('7. Real-world usage:');
  console.log(`
In a real SAML SSO flow:

1. Service Provider redirects user to IdP with AuthnRequest
   → GET https://pigeonidp.fly.dev/saml/sso?SAMLRequest=...

2. User authenticates with PigeonIdP

3. IdP generates SAML Response (as shown above)

4. IdP POST the response back to Service Provider:
   → POST https://sp.example.com/acs
   → Body: SAMLResponse=${samlResponse.substring(0, 50)}...

5. Service Provider validates response and creates session

Service Providers that support SAML 2.0:
- Salesforce
- Google Workspace
- AWS
- Azure AD
- Okta
- OneLogin
- Most enterprise SaaS applications
  `);

  // 8. Cleanup
  console.log('\n8. Cleaning up...');
  await idp.disconnect();
  console.log('✓ Done!\n');

  console.log('=== Next Steps ===');
  console.log('1. Deploy your IdP: npm run deploy');
  console.log('2. Share metadata with Service Providers');
  console.log('3. Configure SSO endpoints');
  console.log('4. Test with a SAML Service Provider');
}

// Run example
samlExample().catch(console.error);
