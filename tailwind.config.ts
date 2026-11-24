import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#EEF0FF",
          100: "#E0E3FF",
          200: "#C7CBFF",
          500: "#635BFF",
          600: "#5046E5",
          700: "#4338CA",
        },
        surface: {
          bg: "#F7F8FC",
          card: "#FFFFFF",
          border: "#E8EAF1",
        },
        ink: {
          main: "#20243A",
          muted: "#747B91",
          subtle: "#9DA3B4",
        },
        accent: {
          teal: "#13B8A6",
          emerald: "#16A36A",
          amber: "#F59E0B",
          rose: "#EF4444",
        },
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.03)",
        elevated: "0 10px 15px -3px rgba(0, 0, 0, 0.04), 0 4px 6px -4px rgba(0, 0, 0, 0.02)",
      },
    },
  },
  plugins: [],
};

export default config;

