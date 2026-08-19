import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#15251f",
        moss: "#1b6b4a",
        mist: "#f3f7f4",
      },
      boxShadow: { panel: "0 18px 55px rgba(22, 66, 48, 0.08)" },
    },
  },
  plugins: [],
} satisfies Config;
