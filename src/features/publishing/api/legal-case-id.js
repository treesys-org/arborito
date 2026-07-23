/**
 * Human-readable case reference for DSA Art. 16 legal notices and owner responses.
 * Format: ARB-YYYYMMDD-XXXXXX (date + random hex, unique per notice).
 */
export function generateLegalCaseId() {
    const d = new Date();
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    let hex = '';
    try {
        const bytes = new Uint8Array(3);
        crypto.getRandomValues(bytes);
        hex = Array.from(bytes)
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('')
            .toUpperCase();
    } catch {
        hex = Math.random().toString(16).slice(2, 8).toUpperCase().padEnd(6, '0').slice(0, 6);
    }
    return `ARB-${y}${m}${day}-${hex}`;
}
