import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#FAFAF9",
        brand: {
          50: "#EEF2FF",
          500: "#6366F1",
          600: "#4F46E5",
          700: "#4338CA"
        },
        trust: {
          green: "#22C55E",
          amber: "#F59E0B",
          red: "#EF4444"
        }
      }
    },
  },
  plugins: [],
};
export default config;
