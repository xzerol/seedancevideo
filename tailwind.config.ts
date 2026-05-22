import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#202334",
        mist: "#f7f8fc",
        line: "#dfe3f3",
        violet: "#5b61ff"
      },
      boxShadow: {
        soft: "0 18px 60px rgba(35, 39, 73, 0.12)"
      }
    }
  },
  plugins: []
};

export default config;
