/**
 * Subject names sliding sideways under “Learn for free”.
 */
export function OnboardingMiniPreview({ ui }) {
    const topics = [
        pick(ui, 'onboardingMiniTopicLang', 'Languages'),
        pick(ui, 'onboardingMiniTopicCode', 'Computing'),
        pick(ui, 'onboardingMiniTopicCook', 'Cooking'),
        pick(ui, 'onboardingMiniTopicBio', 'Biology'),
        pick(ui, 'onboardingMiniTopicMore', 'Infinite possibilities'),
    ];
    const loop = [...topics, ...topics];

    return (
        <div className="arborito-onb-mini" aria-hidden="true">
            <div className="arborito-onb-mini__track">
                {loop.map((name, i) => (
                    <span key={`${name}-${i}`} className="arborito-onb-mini__word">
                        {name}
                    </span>
                ))}
            </div>
        </div>
    );
}

function pick(ui, key, fallback) {
    const v = ui && ui[key];
    return v == null || String(v).trim() === '' ? fallback : String(v);
}
