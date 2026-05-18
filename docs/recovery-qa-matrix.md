# Recovery & passkey — manual QA matrix

Environment: **Linux**, **Chromium** (or Chrome), HTTPS or `http://localhost` as required for WebAuthn.

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 1 | Passkey sign-up | Welcome/profile → create passkey with username | Session shows username; Nostr auth node exists. |
| 2 | Generate backup codes | Profile → Recovery → Generate new backup codes → confirm | Ten codes shown once; previous hashes replaced on Nostr. |
| 3 | Recover with code (incognito) | New profile/incognito → Recovery assistant → username + one code → Register new passkey | Code consumed; new passkey works for sign-in; old codes except used one still valid if not rotated. |
| 4 | Wrong / reused code | Wrong code or same code twice | Clear error; second use of same code fails. |
| 5 | Encrypted recovery file | Profile → Download recovery file with passphrase → incognito → Unlock from file + passphrase → Register passkey | Decrypt succeeds; optional Nostr pair restored from file when present. |
| 6 | Wrong kit passphrase | Import with bad passphrase | “Wrong passphrase or corrupted file” style error. |
| 7 | Recovery QR entry | Show recovery shortcut QR → scan or open URL with `?recover=1` | Recovery assistant opens; welcome modal does not replace it on first paint. |
| 8 | Identity vs recovery scan | Scan contact DID QR vs recovery entry QR | DID saves contact; recovery opens assistant / navigates. |
| 9 | Advanced collapsed | Open profile | DID / contact QR hidden until “Advanced” `<details>` expanded. |
|10 | Rotate codes | Generate codes twice | Second run invalidates first list on server. |

**Regression:** passkey login still works from profile primary button; cloud sync toggle still requires passkey when enabling.
