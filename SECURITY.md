# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

---

## Reporting a Vulnerability

We take the security of Kopi POS and customer retail data seriously. If you discover a security vulnerability, please report it responsibly:

- **Email**: Send vulnerability reports directly to `security@kianlabs.com`.
- **Details to Include**:
  - Description of the vulnerability and attack vector.
  - Steps to reproduce or proof-of-concept (PoC).
  - Affected components (Web UI, Android Native Bridge, SQLite, or AES-GCM Crypto Backup).

Please **do not** open public GitHub issues for sensitive security vulnerabilities.

---

## Security Architecture

1. **Local-First PIN Storage**:
   Supervisor and Void PINs are never stored in plaintext. They are salted with cryptographically secure random bytes (`crypto.getRandomValues`) and hashed using **PBKDF2** (100,000 iterations, SHA-256).
2. **Lockout Protection**:
   Three consecutive incorrect PIN entries trigger a hardware-persisted 5-minute lockout timer (`pos.pin_lockout.v1`).
3. **Backup Encryption**:
   Database export backups utilize **AES-GCM (256-bit)** authenticated encryption with PBKDF2 key derivation. Unauthenticated tampering renders the backup unparseable.
4. **Android Sandbox**:
   SQLite database files reside exclusively within the application's protected private internal storage (`/data/data/com.kianlabs.coffeeshoppos/databases/`).
