import { GITHUB_REPO, YOUTUBE_TREESYS_CHANNEL } from './release-downloads.js';
import { safeStripeSupportUrl } from './stripe-support-url.js';

export const MASTODON_TREESYS_PROFILE = 'https://mastodon.social/@treesys';
export const REDDIT_TREESYS_SUBREDDIT = 'https://www.reddit.com/r/treesys/';
/** Matrix room #arborito:matrix.org (matrix.to invite). */
export const MATRIX_ARBORITO_ROOM = 'https://matrix.to/#/%23arborito:matrix.org';

/** @typedef {{ id: string, url?: string, brand?: string, icon?: string, labelKey: string, hintKey?: string, disabled?: boolean }} CommunityLinkItem */

/** @type {CommunityLinkItem[]} */
export const COMMUNITY_EXTERNAL_LINKS = [
    { id: 'matrix', url: MATRIX_ARBORITO_ROOM, brand: 'matrix', labelKey: 'aboutCommunityMatrix' },
    { id: 'reddit', url: REDDIT_TREESYS_SUBREDDIT, brand: 'reddit', labelKey: 'aboutCommunityReddit' },
    { id: 'youtube', url: YOUTUBE_TREESYS_CHANNEL, brand: 'youtube', labelKey: 'aboutCommunityYoutube' },
    { id: 'github', url: GITHUB_REPO, brand: 'github', labelKey: 'aboutCommunityGithub' },
    { id: 'mastodon', url: MASTODON_TREESYS_PROFILE, brand: 'mastodon', labelKey: 'aboutCommunityMastodon' },
];

/** Voluntary contributions to Arborito development (Stripe Payment Links). */
export const ARBORITO_SUPPORT_STRIPE_ONCE = safeStripeSupportUrl('https://buy.stripe.com/14AcN4aEr2y007SclL8N201');
export const ARBORITO_SUPPORT_STRIPE_MONTHLY = safeStripeSupportUrl('https://buy.stripe.com/eVqdR88wja0s6wg85v8N200');

export const HAS_ARBORITO_SUPPORT = Boolean(ARBORITO_SUPPORT_STRIPE_ONCE || ARBORITO_SUPPORT_STRIPE_MONTHLY);
