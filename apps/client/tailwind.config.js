/** @type {import('tailwindcss').Config} */
module.exports = {
  // Tailwind CSS v4 uses the CSS-first import flow; keep the source sweep broad enough
  content: ["./index.html", "./src/**/*.{vue,ts,js,scss,css}"],
  config: "tailwind.config.js" | "tailwind.config.ts",
  theme: {
    extend: {},
  },
  plugins: [],
};
