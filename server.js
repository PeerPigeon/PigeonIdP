#!/usr/bin/env node
/**
 * PigeonIdP HTTP Server
 * 
 * REST API server for PigeonIdP identity provider
 */

import express from 'express';
import cors from 'cors';
import { PigeonIdP } from './index.js';
import { PigeonIdPSAML, generateSAMLPostForm, decodeSAMLRequest } from './saml.js';

const app = express();
const PORT = process.env.PORT || 3000;
const NAMESPACE = process.env.NAMESPACE || 'pigeonidp-server';
const SIGNALING_SERVERS = process.env.SIGNALING_SERVERS 
  ? process.env.SIGNALING_SERVERS.split(',')
  : ['wss://pigeonhub.fli.dev'];
const IDP_ENTITY_ID = process.env.IDP_ENTITY_ID || `https://${NAMESPACE}.fly.dev`;
const IDP_SSO_URL = process.env.IDP_SSO_URL || `${IDP_ENTITY_ID}/saml/sso`;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // For SAML POST bindings

// Global IdP instance
let idp = null;
let saml = null;

/**
 * Initialize IdP on startup
 */
async function initIdP() {
  console.log('Initializing PigeonIdP server...');
  console.log(`Namespace: ${NAMESPACE}`);
  console.log(`Signaling servers: ${SIGNALING_SERVERS.join(', ')}`);
  
  idp = new PigeonIdP({
    namespace: NAMESPACE,
    signalingServers: SIGNALING_SERVERS
  });
  
  await idp.init();
  console.log('PigeonIdP server initialized successfully');
  
  // Initialize SAML extension
  saml = new PigeonIdPSAML(idp, {
    entityId: IDP_ENTITY_ID,
    ssoUrl: IDP_SSO_URL,
    organizationName: process.env.ORG_NAME || 'PigeonIdP',
    contactEmail: process.env.CONTACT_EMAIL || 'admin@example.com',
    assertionLifetime: parseInt(process.env.ASSERTION_LIFETIME || '300')
  });
  console.log('SAML extension initialized');
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    initialized: idp?.initialized || false,
    namespace: NAMESPACE,
    timestamp: Date.now()
  });
});

// Get server info
app.get('/api/info', (req, res) => {
  res.json({
    namespace: NAMESPACE,
    signalingServers: SIGNALING_SERVERS,
    initialized: idp?.initialized || false,
    version: '1.0.0'
  });
});

// Lookup identity from DHT
app.get('/api/identity/:alias', async (req, res) => {
  try {
    const { alias } = req.params;
    const { namespace } = req.query;
    
    if (!idp?.initialized) {
      return res.status(503).json({ error: 'IdP not initialized' });
    }
    
    const targetNamespace = namespace || NAMESPACE;
    const identity = await idp.lookupIdentity(alias, targetNamespace);
    
    if (!identity) {
      return res.status(404).json({ error: 'Identity not found' });
    }
    
    res.json({
      success: true,
      identity,
      alias,
      namespace: targetNamespace
    });
  } catch (error) {
    console.error('Error looking up identity:', error);
    res.status(500).json({ error: error.message });
  }
});

// Verify a signed message
app.post('/api/verify', async (req, res) => {
  try {
    const { message, signature, publicKey } = req.body;
    
    if (!message || !signature || !publicKey) {
      return res.status(400).json({ 
        error: 'Missing required fields: message, signature, publicKey' 
      });
    }
    
    if (!idp?.initialized) {
      return res.status(503).json({ error: 'IdP not initialized' });
    }
    
    const isValid = await idp.verify(message, signature, publicKey);
    
    res.json({
      success: true,
      valid: isValid,
      message: isValid ? 'Signature is valid' : 'Signature is invalid'
    });
  } catch (error) {
    console.error('Error verifying signature:', error);
    res.status(500).json({ error: error.message });
  }
});

// Verify an authentication token
app.post('/api/verify-token', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ error: 'Missing token' });
    }
    
    if (!idp?.initialized) {
      return res.status(503).json({ error: 'IdP not initialized' });
    }
    
    const result = await idp.verifyAuthToken(token);
    
    res.json({
      success: true,
      valid: result.valid,
      claims: result.claims || null,
      error: result.error || null
    });
  } catch (error) {
    console.error('Error verifying token:', error);
    res.status(500).json({ 
      success: false,
      valid: false,
      error: error.message 
    });
  }
});

// Store data in DHT (public endpoint - use with caution)
app.post('/api/dht/put', async (req, res) => {
  try {
    const { key, value } = req.body;
    
    if (!key || !value) {
      return res.status(400).json({ error: 'Missing key or value' });
    }
    
    if (!idp?.initialized) {
      return res.status(503).json({ error: 'IdP not initialized' });
    }
    
    await idp.webDHT.put(key, value);
    
    res.json({
      success: true,
      message: 'Data stored in DHT',
      key
    });
  } catch (error) {
    console.error('Error storing in DHT:', error);
    res.status(500).json({ error: error.message });
  }
});

// Retrieve data from DHT
app.get('/api/dht/get/:key', async (req, res) => {
  try {
    const { key } = req.params;
    
    if (!idp?.initialized) {
      return res.status(503).json({ error: 'IdP not initialized' });
    }
    
    const value = await idp.webDHT.get(key);
    
    if (value === null || value === undefined) {
      return res.status(404).json({ error: 'Key not found in DHT' });
    }
    
    res.json({
      success: true,
      key,
      value
    });
  } catch (error) {
    console.error('Error retrieving from DHT:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== SAML Endpoints ==========

// SAML Metadata endpoint
app.get('/saml/metadata', (req, res) => {
  try {
    if (!saml) {
      return res.status(503).send('SAML not initialized');
    }
    
    const metadata = saml.getMetadata();
    res.set('Content-Type', 'application/xml');
    res.send(metadata);
  } catch (error) {
    console.error('Error generating metadata:', error);
    res.status(500).json({ error: error.message });
  }
});

// SAML Single Sign-On endpoint (GET - HTTP Redirect binding)
app.get('/saml/sso', async (req, res) => {
  try {
    const { SAMLRequest, RelayState } = req.query;
    
    if (!SAMLRequest) {
      return res.status(400).send('Missing SAMLRequest parameter');
    }
    
    if (!saml || !idp?.initialized) {
      return res.status(503).send('IdP not initialized');
    }
    
    // Decode the SAML request
    const samlRequest = decodeSAMLRequest(SAMLRequest);
    console.log('Received SAML AuthnRequest');
    
    // For demo: show login form
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>PigeonIdP Login</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 400px; margin: 50px auto; padding: 20px; }
          h1 { color: #333; }
          form { background: #f5f5f5; padding: 20px; border-radius: 8px; }
          label { display: block; margin: 10px 0 5px; }
          input { width: 100%; padding: 8px; margin-bottom: 15px; border: 1px solid #ddd; border-radius: 4px; }
          button { width: 100%; padding: 10px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; }
          button:hover { background: #0056b3; }
          .info { background: #e7f3ff; padding: 10px; border-radius: 4px; margin-bottom: 20px; font-size: 14px; }
        </style>
      </head>
      <body>
        <h1>🕊️ PigeonIdP Login</h1>
        <div class="info">
          <strong>SAML Authentication</strong><br>
          A service provider is requesting authentication.
        </div>
        <form action="/saml/sso" method="POST">
          <input type="hidden" name="SAMLRequest" value="${SAMLRequest}">
          <input type="hidden" name="RelayState" value="${RelayState || ''}">
          <label>Username:</label>
          <input type="text" name="username" required autofocus>
          <label>Password:</label>
          <input type="password" name="password" required>
          <button type="submit">Sign In</button>
        </form>
        <p style="text-align: center; font-size: 14px; color: #666;">
          For demo purposes. In production, use secure authentication.
        </p>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error handling SSO request:', error);
    res.status(500).send('Error processing SAML request');
  }
});

// SAML Single Sign-On endpoint (POST - HTTP POST binding)
app.post('/saml/sso', async (req, res) => {
  try {
    const { username, password, SAMLRequest, RelayState } = req.body;
    
    if (!username) {
      return res.status(400).send('Missing username');
    }
    
    if (!saml || !idp?.initialized) {
      return res.status(503).send('IdP not initialized');
    }
    
    // In a real implementation:
    // 1. Validate credentials
    // 2. Create or load user identity
    // 3. Parse SAMLRequest to get SP details
    
    // For demo: create mock user
    const user = {
      id: username,
      username: username,
      attributes: {
        email: `${username}@example.com`,
        name: username,
        roles: ['user']
      }
    };
    
    // Parse destination from SAMLRequest or use default
    const destination = 'https://sp.example.com/acs'; // Would be parsed from SAMLRequest
    const audience = 'https://sp.example.com';        // Would be parsed from SAMLRequest
    const inResponseTo = '_request_id';                // Would be parsed from SAMLRequest
    
    // Generate SAML response
    const samlResponse = await saml.generateResponse(
      user,
      destination,
      audience,
      inResponseTo
    );
    
    // Send response back to SP using HTTP POST binding
    const postForm = generateSAMLPostForm(destination, samlResponse, RelayState);
    res.send(postForm);
    
    console.log(`SAML Response generated for user: ${username}`);
  } catch (error) {
    console.error('Error generating SAML response:', error);
    res.status(500).send('Error generating SAML response');
  }
});

// SAML test endpoint - generate assertion for testing
app.post('/saml/test/assertion', async (req, res) => {
  try {
    const { user, recipient, audience } = req.body;
    
    if (!user || !recipient || !audience) {
      return res.status(400).json({ 
        error: 'Missing required fields: user, recipient, audience' 
      });
    }
    
    if (!saml) {
      return res.status(503).json({ error: 'SAML not initialized' });
    }
    
    const result = await saml.generateAssertion(user, recipient, audience);
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error generating test assertion:', error);
    res.status(500).json({ error: error.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
async function start() {
  try {
    await initIdP();
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`PigeonIdP server listening on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  if (idp) {
    await idp.disconnect();
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  if (idp) {
    await idp.disconnect();
  }
  process.exit(0);
});

start();
