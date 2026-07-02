import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#0a0a0b",
        panel: "#141417",
        border: "#26262b",
        accent: "#facc15",
        "accent-hover": "#fde047",
        muted: "#71717a",
        surface: "#1a1a1e",
      },
    },
  },
  plugins: [],
};

export default config;
