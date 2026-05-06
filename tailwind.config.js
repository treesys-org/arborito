/** @type {import('tailwindcss').Config} */
const plugin = require("tailwindcss/plugin");
const flattenColorPalette = require("tailwindcss/lib/util/flattenColorPalette").default;

// Only color families Arborito uses in var(--*) / custom CSS (fewer lines in main.css).
// Las utilidades bg-slate-*, dark:bg-red-* siguen generándose con el theme completo de Tailwind.
const CSS_VAR_COLOR_FAMILIES = [
  "slate",
  "red",
  "orange",
  "amber",
  "yellow",
  "green",
  "emerald",
  "teal",
  "sky",
  "blue",
  "indigo",
  "purple",
  "pink",
];

module.exports = {
  content: ["./index.html", "./src/**/*.{js,html}"],
  darkMode: "class",
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      /* Firefox font-visibility / RFP: avoid stacks with Roboto, Montserrat, named emoji fonts, etc. */
      fontFamily: {
        sans: ['system-ui', 'sans-serif'],
        serif: ['system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [
    plugin(({ addBase, theme }) => {
      const root = {};
      for (const name of CSS_VAR_COLOR_FAMILIES) {
        const scale = theme(`colors.${name}`);
        if (scale && typeof scale === "object") {
          const flat = flattenColorPalette({ [name]: scale });
          for (const [key, value] of Object.entries(flat)) {
            if (typeof value === "string") {
              root[`--${key}`] = value;
            }
          }
        }
      }
      for (const key of ["black", "white"]) {
        const v = theme(`colors.${key}`);
        if (typeof v === "string") {
          root[`--${key}`] = v;
        }
      }
      addBase({ ":root": root });
    }),
  ],
};
