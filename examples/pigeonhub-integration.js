/**
 * PigeonHub Integration Example
 * 
 * This example demonstrates how to integrate PigeonIdP with PigeonHub
 * for namespace-specific authentication.
 */

import { PigeonIdP } from '../index.js';

async function pigeonHubExample() {
  console.log('=== PigeonIdP + PigeonHub Integration Example ===\n');

  // Create IdP instance for a specific PigeonHub namespace
  const hubNamespace = 'my-pigeon-hub';
  // Initialize IdP
  const idp = new PigeonIdP({
    namespace: 'user-namespace',
    signalingServers: ['wss://pigeonhub.fli.dev']
  });

  console.log(`1. Initializing IdP for namespace: ${hubNamespace}...`);
  await idp.init();
  console.log('   ✓ IdP initialized\n');

  // Create identity for user (without password in Node.js)
  console.log('2. Creating user identity...');
  const keys = await idp.createIdentity('bob');
  console.log('   ✓ Identity created for Bob');
  console.log('   Public Key:', keys.pub.substring(0, 50) + '...\n');

  // Register with profile information
  console.log('3. Registering identity with profile...');
  await idp.registerIdentity({
    username: 'bob',
    displayName: 'Bob Builder',
    email: 'bob@example.com',
    role: 'developer'
  });
  console.log('   ✓ Identity registered in namespace\n');

  // Authenticate with PigeonHub
  console.log('4. Authenticating with PigeonHub...');
  const authResult = await idp.authenticateWithHub(hubNamespace, {
    username: 'bob',
    timestamp: Date.now()
  });
  console.log('   ✓ Authentication request created');
  console.log('   Request Key:', authResult.requestKey);
  console.log('   Token Claims:', JSON.stringify(authResult.token.claims, null, 2), '\n');

  // Verify the authentication token
  console.log('5. Verifying authentication token...');
  const verification = await idp.verifyAuthToken(authResult.token);
  console.log('   ✓ Token verified:', verification.valid);
  console.log('   User:', verification.claims.username, '\n');

  // Simulate a second user in the same namespace
  console.log('6. Creating second user in same namespace...');
  const idp2 = new PigeonIdP({
    namespace: hubNamespace,
    signalingServers: ['wss://pigeonhub.fli.dev']
  });
  await idp2.init();
  const keys2 = await idp2.createIdentity('carol');
  await idp2.registerIdentity({
    username: 'carol',
    displayName: 'Carol Cryptographer',
    email: 'carol@example.com'
  });
  console.log('   ✓ Second user created and registered\n');

  // Bob looks up Carol's identity
  console.log('7. Bob looking up Carol\'s identity...');
  const carolIdentity = await idp.lookupIdentity(keys2.pub);
  console.log('   ✓ Found Carol\'s identity');
  console.log('   Profile:', carolIdentity.profile, '\n');

  // Bob sends encrypted message to Carol
  console.log('8. Bob encrypting message for Carol...');
  const message = 'Hello Carol, welcome to the namespace!';
  const encrypted = await idp.encrypt(message, keys2);
  console.log('   ✓ Message encrypted');
  console.log('   Encrypted ciphertext:', encrypted.ciphertext.substring(0, 50) + '...\n');

  // Carol decrypts the message
  console.log('9. Carol decrypting Bob\'s message...');
  const decrypted = await idp2.decrypt(encrypted);
  console.log('   ✓ Message decrypted');
  console.log('   Message:', decrypted);
  console.log('   From:', encrypted.sender.substring(0, 50) + '...\n');

  // Cross-namespace example
  console.log('10. Creating separate namespace...');
  const otherNamespace = 'another-hub';
  const idp3 = new PigeonIdP({
    namespace: otherNamespace,
    signalingServers: ['wss://pigeonhub.fli.dev']
  });
  await idp3.init();
  await idp3.createIdentity('dave');
  console.log(`   ✓ Created identity in separate namespace: ${otherNamespace}\n`);

  // Cleanup
  console.log('11. Cleaning up...');
  await idp.disconnect();
  await idp2.disconnect();
  await idp3.disconnect();
  console.log('   ✓ All connections closed\n');

  console.log('=== PigeonHub integration example completed! ===');
  console.log('\nKey Features Demonstrated:');
  console.log('- Namespace-specific identity management');
  console.log('- Cross-user authentication and discovery');
  console.log('- Encrypted messaging between users');
  console.log('- Multiple namespaces for different hubs');
}

// Run the example
pigeonHubExample().catch(error => {
  console.error('Error running example:', error);
  process.exit(1);
});
