import { ArboritoLogoMark } from '../../../shared/ui/ArboritoIcons.jsx';

/**
 * Fixed-height gap under guest auth — logo scales inside the slot (hero → compact), never resizes the modal.
 *
 * @param {{ compact?: boolean, busy?: boolean }} props
 */
export function ProfileGuestAuthMascot({ compact = false, busy = false }) {
    const className = [
        'profile-guest-auth__mascot',
        compact ? 'profile-guest-auth__mascot--compact' : 'profile-guest-auth__mascot--hero',
        busy ? 'profile-guest-auth__mascot--busy' : '',
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <div className="profile-guest-auth__mascot-slot" aria-hidden="true">
            <div className={className}>
                <div className="profile-guest-auth__mascot-ring">
                    <ArboritoLogoMark size={40} className="profile-guest-auth__mascot-logo" />
                </div>
            </div>
        </div>
    );
}
