import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        paper: "var(--paper)",
        card: "var(--card)",
        "card-line": "var(--card-line)",
        sidebar: "var(--sidebar)",
        ink: {
          DEFAULT: "var(--ink)",
          2: "var(--ink-2)",
          3: "var(--ink-3)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          hover: "#9a3412",
        },
        pill: "var(--pill)",
        orange: "var(--orange)",
        amber: "var(--amber)",
        sky: "var(--sky)",
        teal: "var(--teal)",
        violet: "var(--violet)",
        rose: "var(--rose)",
        lime: "var(--lime)",
        trust: {
          high: "var(--trust-high)",
          mid: "var(--trust-mid)",
          low: "var(--trust-low)",
          green: "var(--trust-high)",
          amber: "var(--trust-mid)",
          red: "var(--trust-low)",
        },
        brand: {
          50: "#fff7ed",
          500: "#ea580c",
          600: "#c2410c",
          700: "#9a3412",
        },
      },
      borderRadius: {
        card: "var(--radius-card)",
        pill: "var(--radius-pill)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
      },
      transitionTimingFunction: {
        torque: "cubic-bezier(.2,.8,.2,1)",
      },
    },
  },
  plugins: [],
};
export default config;
