/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        primary: '#2196F3',
        secondary: '#FF9800',
        success: '#4CAF50',
        error: '#F44336',
        background: '#F5F5F5',
        card: '#FFFFFF',
        text: '#212121',
        textSecondary: '#757575',
      },
    },
  },
  plugins: [],
}

