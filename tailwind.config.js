/** @type {import('tailwindcss').Config} */
const plugin = require("tailwindcss/plugin");
const flattenColorPalette = require("tailwindcss/lib/util/flattenColorPalette").default;

// Solo familias de color que Arborito usa en var(--*) / CSS custom (menos líneas en main.css).
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
    extend: {},
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
