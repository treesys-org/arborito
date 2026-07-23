/**
 * Reliable hidden file picker (Electron + mobile browsers).
 * Keeps one DOM input, uses addEventListener('change'), and defers click one frame.
 */

const PICKER_ID = 'arborito-hidden-file-picker';

/**
 * @param {{ accept?: string, onFile: (file: File) => void | Promise<void> }} opts
 */
export function pickLocalFile({ accept = '', onFile }) {
    if (typeof document === 'undefined') return;
    let input = document.getElementById(PICKER_ID);
    if (!input) {
        input = document.createElement('input');
        input.id = PICKER_ID;
        input.type = 'file';
        input.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
        input.setAttribute('aria-hidden', 'true');
        input.setAttribute('tabindex', '-1');
        document.body.appendChild(input);
    }
    input.accept = accept;
    input.value = '';

    const finish = () => {
        input.removeEventListener('change', onChange);
        input.removeEventListener('cancel', onCancel);
    };

    const onCancel = () => {
        finish();
    };

    const onChange = (e) => {
        finish();
        const file = e.target?.files?.[0];
        if (!file) return;
        void Promise.resolve(onFile(file)).catch(() => {});
        /* Reset after handler so the same path can be picked again. */
        requestAnimationFrame(() => {
            input.value = '';
        });
    };

    input.addEventListener('change', onChange);
    input.addEventListener('cancel', onCancel);
    requestAnimationFrame(() => {
        try {
            input.click();
        } catch {
            finish();
        }
    });
}
