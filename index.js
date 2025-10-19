/**
 * PigeonIdP - P2P SAML Identity Provider
 * 
 * Uses PeerPigeon WebDHT for decentralized storage and UnSEA for cryptographic operations.
 * Supports custom namespaces for integration with PigeonHub.
 */

import { PeerPigeonMesh, WebDHT } from 'peerpigeon';
import {
  generateRandomPair,
  signMessage,
  verifyMessage,
  encryptMessageWithMeta,
  decryptMessageWithMeta,
  saveKeys,
  loadKeys,
  clearKeys,
  exportToJWK,
  importFromJWK
} from 'unsea';

/**
 * PigeonIdP - Identity Provider for P2P networks
 */
export class PigeonIdP {
  /**
   * Create a new PigeonIdP instance
   * @param {Object} options - Configuration options
   * @param {string} [options.namespace='default'] - Custom namespace for the IdP
   * @param {Array<string>} [options.signalingServers] - Array of signaling server URLs
   * @param {Object} [options.meshOptions] - Additional options for PeerPigeonMesh
   */
  constructor(options = {}) {
    this.namespace = options.namespace || 'default';
    this.signalingServers = options.signalingServers || ['wss://signal.peerpigeon.com'];
    this.meshOptions = options.meshOptions || {};
    
    this.mesh = null;
    this.webDHT = null;
    this.keys = null;
    this.initialized = false;
  }

  /**
   * Initialize the IdP with mesh network and WebDHT
   * @returns {Promise<void>}
   */
  async init() {
    if (this.initialized) {
      return;
    }

    // Initialize PeerPigeon mesh network
    this.mesh = new PeerPigeonMesh({
      signalingServers: this.signalingServers,
      namespace: this.namespace,
      ...this.meshOptions
    });

    await this.mesh.init();

    // Initialize WebDHT for distributed storage
    // WebDHT is ready to use immediately after construction
    this.webDHT = new WebDHT(this.mesh);

    this.initialized = true;
  }

  /**
   * Create a new identity with cryptographic keypair
   * @param {string} [alias='default'] - Alias for the identity
   * @param {string} [password] - Optional password for encrypted storage
   * @returns {Promise<Object>} The generated keypair
   */
  async createIdentity(alias = 'default', password = null) {
    if (!this.initialized) {
      throw new Error('IdP must be initialized before creating identity');
    }

    // Generate new cryptographic keypair using UnSEA
    this.keys = await generateRandomPair();

    // Store keys securely if password provided
    if (password) {
      await saveKeys(alias, this.keys, password);
    }

    // Store public key in DHT for discovery
    const publicKeyData = {
      pub: this.keys.pub,
      epub: this.keys.epub,
      alias,
      namespace: this.namespace,
      created: Date.now()
    };

    await this.webDHT.put(`identity:${alias}:${this.namespace}`, publicKeyData);

    return this.keys;
  }

  /**
   * Load an existing identity from encrypted storage
   * @param {string} alias - Alias of the identity to load
   * @param {string} password - Password to decrypt the keys
   * @returns {Promise<Object>} The loaded keypair
   */
  async loadIdentity(alias, password) {
    if (!this.initialized) {
      throw new Error('IdP must be initialized before loading identity');
    }

    this.keys = await loadKeys(alias, password);
    
    if (!this.keys) {
      throw new Error(`Identity with alias '${alias}' not found`);
    }

    return this.keys;
  }

  /**
   * Sign a message or authentication token
   * @param {string} message - Message to sign
   * @returns {Promise<string>} The signature
   */
  async sign(message) {
    if (!this.keys) {
      throw new Error('No identity loaded. Create or load an identity first');
    }

    return await signMessage(message, this.keys.priv);
  }

  /**
   * Verify a signed message
   * @param {string} message - Original message
   * @param {string} signature - Signature to verify
   * @param {string} publicKey - Public key to verify against
   * @returns {Promise<boolean>} True if signature is valid
   */
  async verify(message, signature, publicKey) {
    return await verifyMessage(message, signature, publicKey);
  }

  /**
   * Encrypt a message for a recipient
   * @param {string} message - Message to encrypt
   * @param {Object} recipientKeys - Recipient's public keys (optional, uses own keys if not provided)
   * @returns {Promise<Object>} Encrypted message object with properties:
   *   - ciphertext: string - The encrypted message
   *   - iv: string - Initialization vector
   *   - sender: string - Sender's public key
   *   - timestamp: number - Encryption timestamp
   */
  async encrypt(message, recipientKeys = null) {
    if (!this.keys) {
      throw new Error('No identity loaded. Create or load an identity first');
    }

    const targetKeys = recipientKeys || this.keys;
    return await encryptMessageWithMeta(message, targetKeys);
  }

  /**
   * Decrypt a message
   * @param {Object} encryptedMessage - Encrypted message object to decrypt
   * @returns {Promise<string>} Decrypted message string
   */
  async decrypt(encryptedMessage) {
    if (!this.keys) {
      throw new Error('No identity loaded. Create or load an identity first');
    }

    return await decryptMessageWithMeta(encryptedMessage, this.keys.epriv);
  }

  /**
   * Generate an authentication token (JWT-like)
   * @param {Object} claims - Claims to include in the token
   * @param {number} [expiresIn=3600] - Token expiration time in seconds
   * @returns {Promise<Object>} Authentication token with signature
   */
  async generateAuthToken(claims = {}, expiresIn = 3600) {
    if (!this.keys) {
      throw new Error('No identity loaded. Create or load an identity first');
    }

    const token = {
      claims: {
        ...claims,
        namespace: this.namespace,
        iss: this.keys.pub, // Issuer (public key)
        iat: Math.floor(Date.now() / 1000), // Issued at
        exp: Math.floor(Date.now() / 1000) + expiresIn // Expiration
      }
    };

    // Sign the token
    const tokenString = JSON.stringify(token.claims);
    token.signature = await this.sign(tokenString);

    return token;
  }

  /**
   * Verify an authentication token
   * @param {Object} token - Token to verify
   * @returns {Promise<Object>} Verification result with claims if valid
   */
  async verifyAuthToken(token) {
    if (!token.claims || !token.signature) {
      return { valid: false, error: 'Invalid token format' };
    }

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (token.claims.exp && token.claims.exp < now) {
      return { valid: false, error: 'Token expired' };
    }

    // Verify signature
    const tokenString = JSON.stringify(token.claims);
    const valid = await this.verify(tokenString, token.signature, token.claims.iss);

    if (!valid) {
      return { valid: false, error: 'Invalid signature' };
    }

    return { valid: true, claims: token.claims };
  }

  /**
   * Register an identity in the DHT for discovery
   * @param {Object} profile - User profile information
   * @returns {Promise<void>}
   */
  async registerIdentity(profile = {}) {
    if (!this.keys) {
      throw new Error('No identity loaded. Create or load an identity first');
    }

    const identityData = {
      pub: this.keys.pub,
      epub: this.keys.epub,
      profile,
      namespace: this.namespace,
      registered: Date.now()
    };

    // Sign the identity data
    const dataString = JSON.stringify(identityData);
    identityData.signature = await this.sign(dataString);

    // Store in DHT
    await this.webDHT.put(`user:${this.keys.pub}:${this.namespace}`, identityData);
  }

  /**
   * Lookup an identity from the DHT
   * @param {string} publicKey - Public key of the identity to lookup
   * @returns {Promise<Object|null>} Identity data if found
   */
  async lookupIdentity(publicKey) {
    if (!this.initialized) {
      throw new Error('IdP must be initialized before looking up identities');
    }

    const data = await this.webDHT.get(`user:${publicKey}:${this.namespace}`);
    
    if (!data) {
      return null;
    }

    // Verify the signature
    const { signature, ...identityData } = data;
    const dataString = JSON.stringify(identityData);
    const valid = await this.verify(dataString, signature, publicKey);

    if (!valid) {
      throw new Error('Identity data signature verification failed');
    }

    return identityData;
  }

  /**
   * Authenticate with PigeonHub namespace
   * @param {string} hubNamespace - PigeonHub namespace to authenticate with
   * @param {Object} credentials - Authentication credentials
   * @returns {Promise<Object>} Authentication result with token
   */
  async authenticateWithHub(hubNamespace, credentials = {}) {
    if (!this.keys) {
      throw new Error('No identity loaded. Create or load an identity first');
    }

    // Create authentication request
    const authRequest = {
      publicKey: this.keys.pub,
      namespace: hubNamespace,
      timestamp: Date.now(),
      credentials
    };

    // Sign the authentication request
    const requestString = JSON.stringify(authRequest);
    authRequest.signature = await this.sign(requestString);

    // Store authentication request in DHT for hub to process
    const requestKey = `auth:${hubNamespace}:${this.keys.pub}:${Date.now()}`;
    await this.webDHT.put(requestKey, authRequest);

    // Generate local token for the session
    const token = await this.generateAuthToken({
      hub: hubNamespace,
      ...credentials
    });

    return {
      success: true,
      token,
      requestKey
    };
  }

  /**
   * Export keys to JWK format
   * @returns {Promise<Object>} Keys in JWK format (private keys) and string format (public keys)
   */
  async exportKeys() {
    if (!this.keys) {
      throw new Error('No identity loaded. Create or load an identity first');
    }

    // Export private keys to JWK, public keys are already in portable string format
    return {
      priv: await exportToJWK(this.keys.priv),
      pub: this.keys.pub, // Public key is already in portable format
      epriv: await exportToJWK(this.keys.epriv),
      epub: this.keys.epub // Encryption public key is already in portable format
    };
  }

  /**
   * Import keys from exported format
   * @param {Object} jwkKeys - Keys object with JWK private keys and string public keys
   * @returns {Promise<void>}
   */
  async importKeys(jwkKeys) {
    this.keys = {
      priv: typeof jwkKeys.priv === 'string' ? jwkKeys.priv : await importFromJWK(jwkKeys.priv),
      pub: jwkKeys.pub, // Public key is already in string format
      epriv: typeof jwkKeys.epriv === 'string' ? jwkKeys.epriv : await importFromJWK(jwkKeys.epriv),
      epub: jwkKeys.epub // Encryption public key is already in string format
    };
  }

  /**
   * Clear stored identity
   * @param {string} alias - Alias of the identity to clear
   * @returns {Promise<void>}
   */
  async clearIdentity(alias) {
    await clearKeys(alias);
    if (this.keys) {
      this.keys = null;
    }
  }

  /**
   * Get current identity public keys
   * @returns {Object|null} Public keys or null if no identity loaded
   */
  getPublicKeys() {
    if (!this.keys) {
      return null;
    }

    return {
      pub: this.keys.pub,
      epub: this.keys.epub
    };
  }

  /**
   * Disconnect from the mesh network
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (this.mesh) {
      this.mesh.disconnect();
      this.mesh = null;
      this.webDHT = null;
      this.initialized = false;
    }
  }
}

// Export for CommonJS compatibility
export default PigeonIdP;
