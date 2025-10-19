# 🕊️ PigeonIdP

> P2P SAML Identity Provider using PeerPigeon WebDHT and UnSEA

A decentralized identity provider (IdP) solution that works in browsers using PeerPigeon's WebDHT for storage and UnSEA for cryptographic operations. Built for integration with PigeonHub and supports custom namespaces.

## Features

- 🔐 **Decentralized Authentication** - No central authority required
- 🌐 **Browser-First** - Works natively in modern browsers
- 🔑 **UnSEA Cryptography** - Uses UnSEA for signing, encryption, and key management
- 💾 **WebDHT Storage** - Distributed hash table for identity storage
- 🏷️ **Custom Namespaces** - Support for namespace-specific authentication
- 🤝 **PigeonHub Integration** - Designed to work with PigeonHub servers
- 📦 **NPM Module** - Easy to import and use in any project
- 🔒 **Secure Key Storage** - Password-encrypted key storage in IndexedDB
- ✅ **JWT-like Tokens** - Generate and verify authentication tokens

## Installation

```bash
npm install pigeonidp
```

## Quick Start

### Node.js Usage

```javascript
import { PigeonIdP } from 'pigeonidp';

// Create an IdP instance with custom namespace
const idp = new PigeonIdP({
  namespace: 'my-app-namespace',
  signalingServers: ['wss://signal.peerpigeon.com']
});

// Initialize the IdP
await idp.init();

// Create a new identity
const keys = await idp.createIdentity('alice', 'secure-password');

// Sign a message
const signature = await idp.sign('Hello World');

// Generate an authentication token
const token = await idp.generateAuthToken({
  username: 'alice',
  role: 'user'
}, 3600); // expires in 1 hour

// Verify the token
const verification = await idp.verifyAuthToken(token);
console.log('Token valid:', verification.valid);

// Disconnect when done
await idp.disconnect();
```

### Browser Usage

```html
<!DOCTYPE html>
<html>
<head>
  <title>PigeonIdP Demo</title>
</head>
<body>
  <script type="module">
    import { PigeonIdP } from './node_modules/pigeonidp/index.js';
    
    const idp = new PigeonIdP({
      namespace: 'my-namespace'
    });
    
    await idp.init();
    await idp.createIdentity('user1', 'password123');
    
    const token = await idp.generateAuthToken({ user: 'user1' });
    console.log('Token:', token);
  </script>
</body>
</html>
```

See [examples/browser-example.html](examples/browser-example.html) for a full interactive demo.

## API Reference

### Constructor

```javascript
new PigeonIdP(options)
```

**Options:**
- `namespace` (string, default: 'default') - Custom namespace for the IdP
- `signalingServers` (array, default: ['wss://signal.peerpigeon.com']) - Signaling servers for WebRTC
- `meshOptions` (object) - Additional options for PeerPigeonMesh

### Methods

#### `init()`
Initialize the IdP with mesh network and WebDHT.

```javascript
await idp.init();
```

#### `createIdentity(alias, password)`
Create a new identity with cryptographic keypair.

```javascript
const keys = await idp.createIdentity('alice', 'secure-password');
```

**Parameters:**
- `alias` (string) - Alias for the identity
- `password` (string, optional) - Password for encrypted storage

**Returns:** Keypair object with `pub`, `priv`, `epub`, `epriv`

#### `loadIdentity(alias, password)`
Load an existing identity from encrypted storage.

```javascript
const keys = await idp.loadIdentity('alice', 'secure-password');
```

#### `sign(message)`
Sign a message or authentication token.

```javascript
const signature = await idp.sign('Hello World');
```

#### `verify(message, signature, publicKey)`
Verify a signed message.

```javascript
const isValid = await idp.verify('Hello World', signature, publicKey);
```

#### `encrypt(message, recipientKeys)`
Encrypt a message for a recipient.

```javascript
const encrypted = await idp.encrypt('Secret message', recipientKeys);
```

#### `decrypt(encryptedMessage)`
Decrypt a message.

```javascript
const decrypted = await idp.decrypt(encrypted);
```

#### `generateAuthToken(claims, expiresIn)`
Generate an authentication token (JWT-like).

```javascript
const token = await idp.generateAuthToken({
  username: 'alice',
  role: 'user'
}, 3600); // expires in 1 hour
```

**Parameters:**
- `claims` (object) - Claims to include in the token
- `expiresIn` (number, default: 3600) - Expiration time in seconds

**Returns:** Token object with `claims` and `signature`

#### `verifyAuthToken(token)`
Verify an authentication token.

```javascript
const result = await idp.verifyAuthToken(token);
if (result.valid) {
  console.log('User:', result.claims.username);
}
```

**Returns:** Object with `valid` (boolean), `claims` (if valid), or `error` (if invalid)

#### `registerIdentity(profile)`
Register an identity in the DHT for discovery.

```javascript
await idp.registerIdentity({
  username: 'alice',
  displayName: 'Alice Wonderland',
  email: 'alice@example.com'
});
```

#### `lookupIdentity(publicKey)`
Lookup an identity from the DHT.

```javascript
const identity = await idp.lookupIdentity(publicKey);
console.log('Profile:', identity.profile);
```

#### `authenticateWithHub(hubNamespace, credentials)`
Authenticate with a PigeonHub namespace.

```javascript
const result = await idp.authenticateWithHub('my-hub', {
  username: 'alice'
});
console.log('Auth token:', result.token);
```

#### `exportKeys()`
Export keys to JWK format.

```javascript
const jwkKeys = await idp.exportKeys();
```

#### `importKeys(jwkKeys)`
Import keys from JWK format.

```javascript
await idp.importKeys(jwkKeys);
```

#### `clearIdentity(alias)`
Clear stored identity.

```javascript
await idp.clearIdentity('alice');
```

#### `getPublicKeys()`
Get current identity public keys.

```javascript
const pubKeys = idp.getPublicKeys();
// Returns { pub, epub }
```

#### `disconnect()`
Disconnect from the mesh network.

```javascript
await idp.disconnect();
```

## Examples

### Basic Usage

See [examples/basic-usage.js](examples/basic-usage.js) for a comprehensive example covering:
- Creating and loading identities
- Signing and verifying messages
- Generating and verifying tokens
- DHT registration and lookup
- Encryption and decryption

Run with:
```bash
node examples/basic-usage.js
```

### PigeonHub Integration

See [examples/pigeonhub-integration.js](examples/pigeonhub-integration.js) for:
- Namespace-specific authentication
- Cross-user discovery
- Encrypted messaging between users
- Multiple namespace support

Run with:
```bash
node examples/pigeonhub-integration.js
```

### Browser Demo

See [examples/browser-example.html](examples/browser-example.html) for an interactive browser demo with UI controls.

## Architecture

PigeonIdP is built on three key technologies:

1. **PeerPigeon** (v1.0.4) - Provides WebRTC mesh networking and WebDHT for distributed storage
2. **UnSEA** - Cryptographic toolkit for key generation, signing, encryption (using WebCrypto and noble-curves)
3. **WebDHT** - Distributed hash table for storing and discovering identities

### Data Flow

```
User Identity
    ↓
UnSEA (Key Generation)
    ↓
Local Storage (Encrypted with Password)
    ↓
WebDHT (Public Keys & Profiles)
    ↓
PeerPigeon Mesh (P2P Network)
```

## Integration with PigeonHub

PigeonIdP is designed to integrate seamlessly with PigeonHub:

1. **Namespace Isolation** - Each PigeonHub server can have its own namespace
2. **Authentication Flow**:
   - User creates/loads identity in IdP
   - IdP generates authentication request
   - Request is stored in DHT under the hub's namespace
   - Hub server verifies and processes authentication
   - Token is issued for authenticated sessions

3. **Discovery** - Users can discover other users in the same namespace through DHT lookups

## Security Considerations

- 🔐 Private keys are encrypted with user passwords before storage
- 🔑 Uses P-256 ECDSA for signatures and ECDH for encryption
- 🛡️ AES-GCM for message encryption
- ⏰ Tokens include expiration timestamps
- ✅ All identity data in DHT is cryptographically signed
- 🔒 Constant-time operations for sensitive comparisons

## Dependencies

- `peerpigeon` (^1.0.4) - Includes:
  - UnSEA for cryptography
  - WebDHT for distributed storage
  - PigeonRTC for WebRTC support

## Browser Compatibility

- ✅ Chrome/Edge (88+)
- ✅ Firefox (78+)
- ✅ Safari (14+)
- ✅ Opera (74+)

Requires WebRTC and WebCrypto API support.

## Node.js Compatibility

- Node.js 16.0.0 or higher
- Uses native WebCrypto API (crypto.webcrypto)

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and questions:
- GitHub Issues: https://github.com/PeerPigeon/PigeonIdP/issues
- PeerPigeon Docs: https://github.com/PeerPigeon/PeerPigeon

## Related Projects

- [PeerPigeon](https://github.com/PeerPigeon/PeerPigeon) - WebRTC mesh networking library
- [UnSEA](https://github.com/draeder/unsea) - Cryptographic toolkit
- [PigeonHub](https://github.com/PeerPigeon/PigeonHub) - P2P hub server (planned integration)

## Author

PigeonIdP is part of the PeerPigeon ecosystem.
