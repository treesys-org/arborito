import { useState } from 'react';
import { SwitchRow } from '../../../shared/ui/SwitchRow.jsx';
import { useIdentityAuth, useIdentityAuthStore } from '../hooks/useIdentityAuth.js';
import {
    isAutoSyncLocalBranchesEnabled,
    setAutoSyncLocalBranches,
} from '../api/register-sync-local.js';

/**
 * Profile-only control: auto-sync local courses (no onboarding switch — silent default on register).
 */
export function ProfileAutoSyncLocalSwitch({ disabled = false }) {
    const { ui, userStore, notify } = useIdentityAuth();
    const store = useIdentityAuthStore();
    const [on, setOn] = useState(() => isAutoSyncLocalBranchesEnabled(userStore));

    return (
        <SwitchRow
            id="profile-auto-sync-local-switch"
            className="profile-auto-sync-local py-1.5"
            label={
                ui.profileAutoSyncLocalLabel || 'Auto-sync local courses'
            }
            checked={on}
            disabled={disabled}
            onChange={(next) => {
                setAutoSyncLocalBranches(userStore, next);
                setOn(!!next);
                if (next) {
                    void store
                        ?.syncAllLocalPrivateBranchesToAccount?.({ silent: true })
                        .then((res) => {
                            const n = Number(res?.synced) || 0;
                            if (n > 0) {
                                notify?.(
                                    (ui.registerSyncLocalDone || 'Local courses synced to your account.').replace(
                                        '{count}',
                                        String(n)
                                    ),
                                    false
                                );
                            }
                        })
                        .catch(() => {});
                }
            }}
            onAria={ui.profileAutoSyncLocalOnAria || 'Enable auto-sync of local courses'}
            offAria={ui.profileAutoSyncLocalOffAria || 'Disable auto-sync of local courses'}
        />
    );
}
