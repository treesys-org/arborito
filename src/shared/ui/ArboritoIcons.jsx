import { ARBORITO_LOGO_MARK_PATH } from './arborito-logo-path.js';

export function LanguageIcon({ size = 20, className = 'arborito-icon-lang' }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="1.6"
            className={className}
            width={size}
            height={size}
            aria-hidden="true"
            focusable="false"
        >
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m10.5 21 5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 0 1 6-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 0 1-3.827-5.802"
            />
        </svg>
    );
}

export function ArboritoLogoMark({ size = 22, className = 'arborito-icon-mark' }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 105.83334 96.572914"
            width={size}
            height={size}
            className={className}
            aria-hidden="true"
        >
            <g transform="translate(-73.554161,-64.690628)">
                <path fill="currentColor" d={ARBORITO_LOGO_MARK_PATH} />
            </g>
        </svg>
    );
}

export function SearchIcon({ size = 20 }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
            width={size}
            height={size}
            aria-hidden="true"
        >
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
        </svg>
    );
}
