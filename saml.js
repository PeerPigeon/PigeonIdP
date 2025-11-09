/**
 * SAML (Security Assertion Markup Language) Support for PigeonIdP
 * 
 * Provides SAML 2.0 assertion generation and validation for P2P identity provider.
 */

import crypto from 'crypto';

/**
 * Generate a SAML 2.0 Assertion
 * @param {Object} options - SAML assertion options
 * @param {string} options.issuer - Identity provider issuer URL
 * @param {string} options.recipient - Service provider recipient URL
 * @param {string} options.subject - User identifier (NameID)
 * @param {Object} options.attributes - User attributes (name, email, roles, etc.)
 * @param {string} options.audienceRestriction - Service provider entity ID
 * @param {number} options.lifetimeSeconds - Assertion lifetime (default: 300)
 * @param {Function} options.signFunction - Async function to sign the assertion
 * @returns {Promise<string>} SAML assertion XML
 */
export async function generateSAMLAssertion(options) {
  const {
    issuer,
    recipient,
    subject,
    attributes = {},
    audienceRestriction,
    lifetimeSeconds = 300,
    signFunction
  } = options;

  const assertionId = `_${generateId()}`;
  const issueInstant = new Date().toISOString();
  const notBefore = issueInstant;
  const notOnOrAfter = new Date(Date.now() + lifetimeSeconds * 1000).toISOString();
  const authnInstant = issueInstant;
  const sessionIndex = `_${generateId()}`;

  // Build attribute statements
  let attributeStatements = '';
  if (Object.keys(attributes).length > 0) {
    const attrs = Object.entries(attributes).map(([name, value]) => {
      const values = Array.isArray(value) ? value : [value];
      const attributeValues = values.map(v => 
        `<saml:AttributeValue xsi:type="xs:string">${escapeXml(String(v))}</saml:AttributeValue>`
      ).join('');
      
      return `<saml:Attribute Name="${escapeXml(name)}" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic">
        ${attributeValues}
      </saml:Attribute>`;
    }).join('\n      ');

    attributeStatements = `<saml:AttributeStatement>
      ${attrs}
    </saml:AttributeStatement>`;
  }

  // Build SAML assertion
  const assertion = `<?xml version="1.0" encoding="UTF-8"?>
<saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
                xmlns:xs="http://www.w3.org/2001/XMLSchema"
                xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                ID="${assertionId}"
                Version="2.0"
                IssueInstant="${issueInstant}">
  <saml:Issuer>${escapeXml(issuer)}</saml:Issuer>
  <saml:Subject>
    <saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified">${escapeXml(subject)}</saml:NameID>
    <saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">
      <saml:SubjectConfirmationData NotOnOrAfter="${notOnOrAfter}"
                                     Recipient="${escapeXml(recipient)}"
                                     InResponseTo="_request_id"/>
    </saml:SubjectConfirmation>
  </saml:Subject>
  <saml:Conditions NotBefore="${notBefore}" NotOnOrAfter="${notOnOrAfter}">
    <saml:AudienceRestriction>
      <saml:Audience>${escapeXml(audienceRestriction)}</saml:Audience>
    </saml:AudienceRestriction>
  </saml:Conditions>
  <saml:AuthnStatement AuthnInstant="${authnInstant}" SessionIndex="${sessionIndex}">
    <saml:AuthnContext>
      <saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:unspecified</saml:AuthnContextClassRef>
    </saml:AuthnContext>
  </saml:AuthnStatement>
  ${attributeStatements}
</saml:Assertion>`;

  // Sign the assertion if signing function provided
  if (signFunction) {
    const signature = await signFunction(assertion);
    return {
      assertion,
      signature,
      assertionId
    };
  }

  return {
    assertion,
    assertionId
  };
}

/**
 * Generate a SAML Response envelope
 * @param {Object} options - Response options
 * @param {string} options.assertion - SAML assertion XML
 * @param {string} options.issuer - Identity provider issuer URL
 * @param {string} options.destination - Service provider ACS URL
 * @param {string} options.inResponseTo - ID of the AuthnRequest (optional)
 * @param {string} options.statusCode - Status code (default: Success)
 * @returns {string} SAML response XML
 */
export function generateSAMLResponse(options) {
  const {
    assertion,
    issuer,
    destination,
    inResponseTo = '_request_id',
    statusCode = 'urn:oasis:names:tc:SAML:2.0:status:Success'
  } = options;

  const responseId = `_${generateId()}`;
  const issueInstant = new Date().toISOString();

  return `<?xml version="1.0" encoding="UTF-8"?>
<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
                xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
                ID="${responseId}"
                Version="2.0"
                IssueInstant="${issueInstant}"
                Destination="${escapeXml(destination)}"
                InResponseTo="${inResponseTo}">
  <saml:Issuer>${escapeXml(issuer)}</saml:Issuer>
  <samlp:Status>
    <samlp:StatusCode Value="${statusCode}"/>
  </samlp:Status>
  ${assertion}
</samlp:Response>`;
}

/**
 * Generate SAML Metadata for the IdP
 * @param {Object} options - Metadata options
 * @param {string} options.entityId - IdP entity ID (URL)
 * @param {string} options.ssoUrl - Single Sign-On service URL
 * @param {string} options.publicKey - IdP public key (base64 or PEM)
 * @param {string} options.organizationName - Organization name
 * @param {string} options.contactEmail - Technical contact email
 * @returns {string} SAML metadata XML
 */
export function generateIdPMetadata(options) {
  const {
    entityId,
    ssoUrl,
    publicKey,
    organizationName = 'PigeonIdP',
    contactEmail = 'admin@example.com'
  } = options;

  const validUntil = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  return `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"
                     xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
                     entityID="${escapeXml(entityId)}"
                     validUntil="${validUntil}">
  <md:IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:KeyDescriptor use="signing">
      <ds:KeyInfo>
        <ds:X509Data>
          <ds:X509Certificate>${publicKey.replace(/\n/g, '')}</ds:X509Certificate>
        </ds:X509Data>
      </ds:KeyInfo>
    </md:KeyDescriptor>
    <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified</md:NameIDFormat>
    <md:NameIDFormat>urn:oasis:names:tc:SAML:2.0:nameid-format:persistent</md:NameIDFormat>
    <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
                            Location="${escapeXml(ssoUrl)}"/>
    <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
                            Location="${escapeXml(ssoUrl)}"/>
  </md:IDPSSODescriptor>
  <md:Organization>
    <md:OrganizationName xml:lang="en">${escapeXml(organizationName)}</md:OrganizationName>
    <md:OrganizationDisplayName xml:lang="en">${escapeXml(organizationName)}</md:OrganizationDisplayName>
    <md:OrganizationURL xml:lang="en">${escapeXml(entityId)}</md:OrganizationURL>
  </md:Organization>
  <md:ContactPerson contactType="technical">
    <md:EmailAddress>${escapeXml(contactEmail)}</md:EmailAddress>
  </md:ContactPerson>
</md:EntityDescriptor>`;
}

/**
 * Base64 encode a SAML response for HTTP POST binding
 * @param {string} samlResponse - SAML response XML
 * @returns {string} Base64 encoded response
 */
export function encodeSAMLResponse(samlResponse) {
  return Buffer.from(samlResponse).toString('base64');
}

/**
 * Decode a SAML request from HTTP POST binding
 * @param {string} encodedRequest - Base64 encoded SAML request
 * @returns {string} Decoded SAML request XML
 */
export function decodeSAMLRequest(encodedRequest) {
  return Buffer.from(encodedRequest, 'base64').toString('utf-8');
}

/**
 * Generate HTML form for SAML POST binding
 * @param {string} acsUrl - Assertion Consumer Service URL
 * @param {string} samlResponse - Base64 encoded SAML response
 * @param {string} relayState - Optional relay state
 * @returns {string} HTML form that auto-submits
 */
export function generateSAMLPostForm(acsUrl, samlResponse, relayState = '') {
  const relayStateInput = relayState 
    ? `<input type="hidden" name="RelayState" value="${escapeXml(relayState)}"/>` 
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <title>SAML POST</title>
</head>
<body onload="document.forms[0].submit()">
  <form method="POST" action="${escapeXml(acsUrl)}">
    <input type="hidden" name="SAMLResponse" value="${escapeXml(samlResponse)}"/>
    ${relayStateInput}
    <noscript>
      <button type="submit">Continue</button>
    </noscript>
  </form>
</body>
</html>`;
}

/**
 * Helper: Escape XML special characters
 */
function escapeXml(unsafe) {
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Helper: Generate a random ID
 */
function generateId() {
  return crypto.randomBytes(20).toString('hex');
}

/**
 * PigeonIdP SAML extension
 * Adds SAML 2.0 support to PigeonIdP instances
 */
export class PigeonIdPSAML {
  /**
   * Create SAML extension for PigeonIdP
   * @param {PigeonIdP} idp - PigeonIdP instance
   * @param {Object} config - SAML configuration
   * @param {string} config.entityId - IdP entity ID
   * @param {string} config.ssoUrl - Single Sign-On URL
   */
  constructor(idp, config) {
    this.idp = idp;
    this.config = config;
  }

  /**
   * Generate SAML assertion for authenticated user
   * @param {Object} user - User information
   * @param {string} recipient - Service provider ACS URL
   * @param {string} audience - Service provider entity ID
   * @returns {Promise<Object>} SAML assertion with signature
   */
  async generateAssertion(user, recipient, audience) {
    return await generateSAMLAssertion({
      issuer: this.config.entityId,
      recipient,
      subject: user.id || user.username,
      attributes: user.attributes || {},
      audienceRestriction: audience,
      lifetimeSeconds: this.config.assertionLifetime || 300,
      signFunction: async (data) => {
        return await this.idp.sign(data);
      }
    });
  }

  /**
   * Generate complete SAML response
   * @param {Object} user - User information
   * @param {string} destination - Service provider ACS URL
   * @param {string} audience - Service provider entity ID
   * @param {string} inResponseTo - AuthnRequest ID
   * @returns {Promise<string>} Base64 encoded SAML response
   */
  async generateResponse(user, destination, audience, inResponseTo) {
    const { assertion } = await this.generateAssertion(user, destination, audience);
    
    const response = generateSAMLResponse({
      assertion,
      issuer: this.config.entityId,
      destination,
      inResponseTo
    });

    return encodeSAMLResponse(response);
  }

  /**
   * Get IdP metadata
   * @returns {string} SAML metadata XML
   */
  getMetadata() {
    const publicKey = this.idp.getPublicKeys()?.pub || '';
    
    return generateIdPMetadata({
      entityId: this.config.entityId,
      ssoUrl: this.config.ssoUrl,
      publicKey,
      organizationName: this.config.organizationName,
      contactEmail: this.config.contactEmail
    });
  }
}
