import { useState } from 'react';
import { FormNestedSheet } from '../../../shared/ui/FormNestedSheet.jsx';
import { Callout } from '../../../shared/ui/Callout.jsx';

function isValidGameUrl(raw) {
    const u = String(raw || '').trim();
    if (!u) return false;
    try {
        const parsed = new URL(u);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

export function ArcadeAddGameSheet({ ui, onCancel, onSubmit }) {
    const [url, setUrl] = useState('');
    const [error, setError] = useState('');

    const submit = () => {
        const trimmed = url.trim();
        if (!isValidGameUrl(trimmed)) {
            setError(ui.arcadeAddGameInvalidUrl || 'Enter a valid http(s) URL.');
            return;
        }
        onSubmit(trimmed);
    };

    return (
        <FormNestedSheet
            panelId="arcade-add-game-card"
            headingId="arcade-add-game-heading"
            kicker={ui.arcadeAddGameSheetKicker || ''}
            title={ui.arcadeAddGameSheetTitle || ui.arcadeAdd}
            hint={ui.arcadeAddGameSheetHint || ''}
            leadingIcon="🕹️"
            closeLabel={ui.close || 'Close'}
            cancelLabel={ui.cancel || 'Cancel'}
            submitLabel={ui.arcadeAddGameSubmit || ui.arcadeAdd}
            focusInputId="arcade-add-game-url"
            onCancel={onCancel}
            onSubmit={submit}
        >
            <Callout tone="sky" icon="ℹ️" richHtml={ui.arcadeAddGamePublishNotice || ''} size="sm" />
            <div>
                <label className="arborito-eyebrow block mb-2" htmlFor="arcade-add-game-url">
                    {ui.arcadeAddGameUrlLabel || ui.arcadeAdd}
                </label>
                <input
                    type="url"
                    id="arcade-add-game-url"
                    autoComplete="off"
                    inputMode="url"
                    className="arborito-input text-base py-3.5 font-medium w-full"
                    placeholder={ui.arcadePlaceholder || ''}
                    value={url}
                    onChange={(e) => {
                        setUrl(e.target.value);
                        if (error) setError('');
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            submit();
                        }
                    }}
                />
                {error ? (
                    <p className="text-xs text-red-500 mt-2 font-medium" role="alert">
                        {error}
                    </p>
                ) : null}
            </div>
        </FormNestedSheet>
    );
}
