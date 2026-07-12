# Online accounts, passwords, and sync

Arborito’s optional **online account** backs up encrypted progress and unlocks forum, ranking, and publishing features. There is **no email** and **no central login server**: credentials are verified against a record your device publishes on Nostr relays.

## Credential model (password-only for new accounts)

| Piece | What it is |
|-------|------------|
| **Username** | Public handle on the network (normalized lowercase). |
| **Password** | User-chosen secret for daily sign-in. Only a SHA-256 hash is published on relays. |
| **Sync key** | Export on signed-in device; import on login (other device). Encrypted file + optional QR. |
| **Recovery passphrase** | Only if you forget your password. User-chosen; not the sync key. |
| **Recovery key file** | Encrypted export of the sync kit; sign-in alternative inside **Forgot your password?** |

New accounts are always **password** accounts (`credentialKind: password`). Registration lives in `registerSyncLoginAccountAction` (`identity-sync-login-store-actions.js`).

## Sign-in paths (industry-style UX)

### Primary: username + password

Used in onboarding and Profile. **Forgot your password?** opens recovery: passphrase **or** recovery key file import — not QR.

### Sync another device (not “forgot password”)

| Device | Primary alternative | Secondary |
|--------|---------------------|-----------|
| **Desktop / tablet** | Import **sync key file** (signed-in export) | Scan sync QR (camera) |
| **Phone** | **Scan sync QR** | — |

Implementation: `LoginAuthExtras.jsx`, `ProfileLoginMethodTabs.jsx`, `OnboardingSignIn.jsx` + `useViewportShell()`.

### Show QR on a signed-in desktop

`ProfileQrSyncPanel.jsx` — **Sync with QR**. The code carries an encrypted recovery kit (`recovery-kit.js`), not the password in plain text.

### Scan QR on the new device

`SyncLoginQrScannerModal.jsx` — parses `arborito.recovery.kit` payloads only.

### Import recovery key file (forgot-password flow)

Encrypted `.txt` from Profile or post-registration onboarding (`downloadRecoveryKitFileAction`). Offered inside `RecoverAccountModal.jsx` (mode `recover`), not under the password field on the login form.

## Recovery passphrase (forgot password)

- **Setup:** user types and repeats their own passphrase (`RecoverAccountModal.jsx`, mode `setup`).
- **Recover:** username + passphrase → decrypt blob → sign in (`recoverAccountWithPassphraseAction`).
- **Or:** recovery key file import in the same modal.
- Crypto: `account-recovery.js` — scrypt (N=2^15, r=8) + AES-GCM, Nostr kind **30295**, `d = arborito:account:recovery:<user>`.
- **No auto-generated word lists** and no security questions (PII-free by design).
- Changing password clears the old recovery blob; user must set recovery again (`ChangePasswordModal.jsx`).

## Online / offline (relay servers)

Profile no longer exposes the **Online** toggle. Network consent, relay URLs, and the liability disclaimer live under **Privacy & data** (`PrivacyModal.jsx` + `ProfileNetworkRelays.jsx`). Onboarding step 1 grants network consent via **Accept and continue** (recommended relay bundle); a separate **Continue offline** link opts out with confirmation. See [`NOSTR_RELAYS_CONFIGURATION.md`](NOSTR_RELAYS_CONFIGURATION.md).

## Code map

```
src/features/identity-auth/
  api/
    sync-login-secret.js      # password hash, session credential kind, signing key derivation
    recovery-kit.js           # encrypted sync kit (QR + file)
    account-recovery.js       # recovery passphrase blob
    auth-session-persist.js   # localStorage session (credentialKind, recoveryKeyPlain)
  components/
    LoginAuthExtras.jsx
    ProfileLoginMethodTabs.jsx
    ProfileQrSyncPanel.jsx
    ProfilePasswordSecurityPanel.jsx
    LoginRecoverySetupCard.jsx
  modals/
    OnboardingSignIn.jsx
    OnboardingModal.jsx
    ProfileSignIn.jsx
    ProfileNetworkRelays.jsx
    RecoverAccountModal.jsx
    SyncLoginQrScannerModal.jsx
    ChangePasswordModal.jsx
src/stores/
  identity-sync-login-store-actions.js
  identity-auth-store-actions.js   # _finalizeSyncLoginSession → recovery-kit QR
```

## Security notes

1. **Session secrets** (`syncSecretPlain`, `recoveryKeyPlain`) live in `localStorage` on the device — see Privacy & data.
2. **Relay record** stores only the password hash and signed metadata, not the password.
3. **Recovery blob** is public per username; use a strong passphrase (min 12 chars after normalization).
4. **Sync kit** encrypts the password under the recovery key; treat exported files like a backup key.

## Related docs

- [`USER_DATA_LAYOUT.md`](USER_DATA_LAYOUT.md) — where session data is stored
- [`NETWORK_AND_SECURITY.md`](NETWORK_AND_SECURITY.md) — Nostr entry points and consent
- [`MODAL_STANDARDS.md`](MODAL_STANDARDS.md) — modal types including `account-recovery`, `sync-login-qr-scanner`
- [`NOSTR_RELAYS_CONFIGURATION.md`](NOSTR_RELAYS_CONFIGURATION.md) — relay lists and Privacy & data controls
