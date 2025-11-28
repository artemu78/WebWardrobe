/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./popup.html", "./popup.js"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: "#4F46E5",
        "background-light": "#F9FAFB",
        "background-dark": "#111827",
      },
      fontFamily: {
        display: ["Roboto", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "0.5rem",
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
}
