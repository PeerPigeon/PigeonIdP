/**
 * Basic usage example for PigeonIdP
 * 
 * This example demonstrates:
 * - Creating an identity
 * - Signing and verifying messages
 * - Generating authentication tokens
 * - Using custom namespaces
 */

import { PigeonIdP } from '../index.js';

async function basicExample() {
  console.log('=== PigeonIdP Basic Usage Example ===\n');

  // Create IdP instance with custom namespace
  const idp = new PigeonIdP({
    namespace: 'my-custom-namespace',
    signalingServers: ['wss://signal.peerpigeon.com']
  });

  console.log('1. Initializing IdP...');
  await idp.init();
  console.log('   ✓ IdP initialized\n');

  // Create a new identity
  console.log('2. Creating new identity...');
  const keys = await idp.createIdentity('alice', 'secure-password-123');
  console.log('   ✓ Identity created');
  console.log('   Public Key:', keys.pub.substring(0, 50) + '...\n');

  // Sign a message
  console.log('3. Signing a message...');
  const message = 'Hello from PigeonIdP!';
  const signature = await idp.sign(message);
  console.log('   ✓ Message signed');
  console.log('   Message:', message);
  console.log('   Signature:', signature.substring(0, 50) + '...\n');

  // Verify the signature
  console.log('4. Verifying signature...');
  const isValid = await idp.verify(message, signature, keys.pub);
  console.log('   ✓ Signature verified:', isValid, '\n');

  // Generate authentication token
  console.log('5. Generating authentication token...');
  const token = await idp.generateAuthToken({
    username: 'alice',
    role: 'user'
  }, 3600);
  console.log('   ✓ Token generated');
  console.log('   Claims:', JSON.stringify(token.claims, null, 2), '\n');

  // Verify the token
  console.log('6. Verifying authentication token...');
  const verification = await idp.verifyAuthToken(token);
  console.log('   ✓ Token verification result:', verification.valid);
  console.log('   Claims:', verification.claims ? verification.claims.username : 'N/A', '\n');

  // Register identity in DHT
  console.log('7. Registering identity in DHT...');
  await idp.registerIdentity({
    username: 'alice',
    displayName: 'Alice Wonderland',
    email: 'alice@example.com'
  });
  console.log('   ✓ Identity registered in DHT\n');

  // Lookup identity
  console.log('8. Looking up identity from DHT...');
  const identity = await idp.lookupIdentity(keys.pub);
  console.log('   ✓ Identity found');
  console.log('   Profile:', identity.profile, '\n');

  // Encrypt and decrypt a message
  console.log('9. Encrypting a message...');
  const secretMessage = 'This is a secret message';
  const encrypted = await idp.encrypt(secretMessage);
  console.log('   ✓ Message encrypted');
  console.log('   Encrypted:', encrypted.substring(0, 50) + '...\n');

  console.log('10. Decrypting the message...');
  const decrypted = await idp.decrypt(encrypted);
  console.log('   ✓ Message decrypted');
  console.log('   Decrypted:', decrypted.message, '\n');

  // Export keys
  console.log('11. Exporting keys to JWK format...');
  const exportedKeys = await idp.exportKeys();
  console.log('   ✓ Keys exported');
  console.log('   JWK format available\n');

  // Disconnect
  console.log('12. Disconnecting from mesh...');
  await idp.disconnect();
  console.log('   ✓ Disconnected\n');

  console.log('=== Example completed successfully! ===');
}

// Run the example
basicExample().catch(error => {
  console.error('Error running example:', error);
  process.exit(1);
});
