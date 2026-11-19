# Security Policy

## Supported Versions

Security fixes are released for the versions below. Older versions do not receive fixes; upgrade to a supported version.

| Version | Supported          |
| ------- | ------------------ |
| 1.1.x   | :white_check_mark: |
| 1.0.x   | :x:                |
| < 1.0   | :x:                |

When a new minor or major version is released, this table is updated in the same pull request.

---

## Reporting a Vulnerability

We take the security of Suro POS and customer retail data seriously. Report vulnerabilities privately through either channel:

- **Email**: `security@kianlabs.com`.
- **GitHub**: use "Report a vulnerability" under the repository's **Security** tab (private security advisory), when it is enabled.

Include as much of the following as you can:

- Description of the vulnerability and attack vector.
- Steps to reproduce or a proof of concept.
- Affected components (Web UI, Android native bridge, SQLite, AES-GCM encrypted backup, update/OTA, sync).
- Affected app version and device model (if relevant).

Please **do not** open public GitHub issues, pull requests, or discussions for security vulnerabilities, and do not include real customer data in reports.

### Response targets

| Step | Target |
| ---- | ------ |
| Initial response (acknowledgement of your report) | within **7 calendar days** of receipt |
| Assessment and severity rating | shared with you after the initial response |
| Fix and release | depends on severity; you get a status update at least every 14 days until resolved |

We credit reporters in the release notes unless you ask to stay anonymous. Please allow us to release a fix before you disclose the issue publicly.

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
