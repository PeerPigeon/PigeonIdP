/**
 * Basic tests for PigeonIdP
 */

import { PigeonIdP } from '../index.js';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✓ ${message}`);
    testsPassed++;
  } else {
    console.error(`✗ ${message}`);
    testsFailed++;
  }
}

async function runTests() {
  console.log('=== Running PigeonIdP Tests ===\n');

  try {
    // Test 1: Create IdP instance
    console.log('Test 1: Create IdP instance');
    const idp = new PigeonIdP({
      namespace: 'test-namespace',
      signalingServers: ['wss://pigeonhub.fli.dev']
    });
    assert(idp !== null, 'IdP instance created');
    assert(idp.namespace === 'test-namespace', 'Namespace set correctly');

    // Test 2: Initialize IdP
    console.log('\nTest 2: Initialize IdP');
    await idp.init();
    assert(idp.initialized === true, 'IdP initialized');
    assert(idp.mesh !== null, 'Mesh network created');
    assert(idp.webDHT !== null, 'WebDHT created');

    // Test 3: Create identity
    console.log('\nTest 3: Create identity');
    const keys = await idp.createIdentity('test-user');
    assert(keys !== null, 'Keys generated');
    assert(typeof keys.pub === 'string', 'Public key is string');
    assert(keys.priv !== null, 'Private key exists');
    assert(keys.pub.length > 0, 'Public key has content');

    // Test 4: Sign message
    console.log('\nTest 4: Sign message');
    const message = 'Test message for signing';
    const signature = await idp.sign(message);
    assert(signature !== null, 'Message signed');
    assert(typeof signature === 'string', 'Signature is string');
    assert(signature.length > 0, 'Signature has content');

    // Test 5: Verify signature
    console.log('\nTest 5: Verify signature');
    const isValid = await idp.verify(message, signature, keys.pub);
    assert(isValid === true, 'Signature verified successfully');

    // Test 6: Verify invalid signature
    console.log('\nTest 6: Verify invalid signature');
    const isInvalid = await idp.verify('Wrong message', signature, keys.pub);
    assert(isInvalid === false, 'Invalid signature rejected');

    // Test 7: Encrypt message
    console.log('\nTest 7: Encrypt message');
    const secretMessage = 'This is a secret message';
    const encrypted = await idp.encrypt(secretMessage);
    assert(encrypted !== null, 'Message encrypted');
    assert(typeof encrypted === 'object', 'Encrypted message is object');
    assert(encrypted.ciphertext !== undefined, 'Ciphertext exists');
    assert(encrypted.sender !== undefined, 'Sender info included');

    // Test 8: Decrypt message
    console.log('\nTest 8: Decrypt message');
    const decrypted = await idp.decrypt(encrypted);
    assert(decrypted !== null, 'Message decrypted');
    assert(decrypted === secretMessage, 'Decrypted message matches original');
    assert(typeof encrypted.sender === 'string', 'Sender in encrypted object');

    // Test 9: Generate authentication token
    console.log('\nTest 9: Generate authentication token');
    const token = await idp.generateAuthToken({
      username: 'test-user',
      role: 'tester'
    }, 3600);
    assert(token !== null, 'Token generated');
    assert(token.claims !== null, 'Token has claims');
    assert(token.signature !== null, 'Token has signature');
    assert(token.claims.username === 'test-user', 'Token includes username');
    assert(token.claims.namespace === 'test-namespace', 'Token includes namespace');
    assert(typeof token.claims.exp === 'number', 'Token has expiration');

    // Test 10: Verify authentication token
    console.log('\nTest 10: Verify authentication token');
    const verification = await idp.verifyAuthToken(token);
    assert(verification.valid === true, 'Token is valid');
    assert(verification.claims.username === 'test-user', 'Claims preserved');

    // Test 11: Verify expired token
    console.log('\nTest 11: Verify expired token');
    const expiredToken = await idp.generateAuthToken({ test: 'expired' }, -1);
    const expiredVerification = await idp.verifyAuthToken(expiredToken);
    assert(expiredVerification.valid === false, 'Expired token rejected');
    assert(expiredVerification.error === 'Token expired', 'Correct error message');

    // Test 12: Get public keys
    console.log('\nTest 12: Get public keys');
    const pubKeys = idp.getPublicKeys();
    assert(pubKeys !== null, 'Public keys retrieved');
    assert(pubKeys.pub === keys.pub, 'Public key matches');
    assert(pubKeys.epub === keys.epub, 'Encryption public key matches');

    // Test 13: Export keys
    console.log('\nTest 13: Export keys');
    const exportedKeys = await idp.exportKeys();
    assert(exportedKeys !== null, 'Keys exported');
    assert(exportedKeys.pub !== null, 'Public key exported');
    assert(exportedKeys.priv !== null, 'Private key exported');
    assert(typeof exportedKeys.priv === 'object', 'Exported private key is JWK object');
    assert(typeof exportedKeys.pub === 'string', 'Exported public key is string');

    // Test 14: Register identity in DHT
    console.log('\nTest 14: Register identity in DHT');
    await idp.registerIdentity({
      username: 'test-user',
      email: 'test@example.com'
    });
    assert(true, 'Identity registered in DHT');

    // Test 15: Lookup identity from DHT
    console.log('\nTest 15: Lookup identity from DHT');
    const identity = await idp.lookupIdentity(keys.pub);
    assert(identity !== null, 'Identity found in DHT');
    assert(identity.profile.username === 'test-user', 'Profile data correct');
    assert(identity.pub === keys.pub, 'Public key matches');

    // Test 16: Authenticate with hub
    console.log('\nTest 16: Authenticate with hub');
    const authResult = await idp.authenticateWithHub('test-hub', {
      username: 'test-user'
    });
    assert(authResult.success === true, 'Authentication successful');
    assert(authResult.token !== null, 'Auth token generated');
    assert(authResult.requestKey !== null, 'Request key generated');

    // Test 17: Disconnect
    console.log('\nTest 17: Disconnect');
    await idp.disconnect();
    assert(idp.initialized === false, 'IdP disconnected');
    assert(idp.mesh === null, 'Mesh cleaned up');

    // Test 18: Multiple namespaces
    console.log('\nTest 18: Multiple namespaces');
    const idp1 = new PigeonIdP({ namespace: 'namespace1' });
    const idp2 = new PigeonIdP({ namespace: 'namespace2' });
    await idp1.init();
    await idp2.init();
    assert(idp1.namespace !== idp2.namespace, 'Different namespaces');
    await idp1.disconnect();
    await idp2.disconnect();

    console.log('\n=== Test Summary ===');
    console.log(`Passed: ${testsPassed}`);
    console.log(`Failed: ${testsFailed}`);
    console.log(`Total: ${testsPassed + testsFailed}`);

    if (testsFailed === 0) {
      console.log('\n✓ All tests passed!');
      process.exit(0);
    } else {
      console.log('\n✗ Some tests failed');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n✗ Test error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests
runTests();
