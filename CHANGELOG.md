# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-10-19

### Added
- Initial release of PigeonIdP
- P2P Identity Provider using PeerPigeon WebDHT for storage
- UnSEA integration for cryptographic operations
- Support for custom namespaces
- Identity creation and management
- Message signing and verification
- Message encryption and decryption
- JWT-like authentication token generation and verification
- DHT-based identity registration and lookup
- PigeonHub namespace authentication integration
- Key export/import in JWK format
- Browser and Node.js support
- Comprehensive test suite
- Example files for basic usage, PigeonHub integration, and browser demo
- Full API documentation in README

### Security
- Password-encrypted key storage (browser only via IndexedDB)
- P-256 ECDSA for signatures
- ECDH + AES-GCM for encryption
- Token expiration support
- Signed identity data in DHT

[1.0.0]: https://github.com/PeerPigeon/PigeonIdP/releases/tag/v1.0.0
