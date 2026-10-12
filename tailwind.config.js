/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Titan One"', "system-ui", "sans-serif"],
        body: ['"Nunito"', "system-ui", "sans-serif"],
      },
      colors: {
        ink: "#14061f",
        neon: {
          pink: "#ff3d8a",
          cyan: "#24f0ff",
          gold: "#ffd23f",
          lime: "#b6ff3b",
          violet: "#8b5cff",
        },
      },
      boxShadow: {
        arcade: "0 8px 0 #3b0764, 0 16px 32px rgba(0,0,0,.45)",
        glow: "0 0 24px rgba(36,240,255,.55)",
      },
    },
  },
  plugins: [],
};
