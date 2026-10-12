'use client';

import { useEffect, useState } from 'react';

export default function ToggleTheme() {
  const [isLight, setIsLight] = useState(false);

  // Load initial mode
  useEffect(() => {
    const root = document.documentElement;
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
      root.classList.add('light');
      setIsLight(true);
    }
  }, []);

  // Toggle function
  const toggleTheme = () => {
    const root = document.documentElement;
    if (isLight) {
      root.classList.remove('light');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.add('light');
      localStorage.setItem('theme', 'light');
    }
    setIsLight(!isLight);
  };

  return (
    <button
      onClick={toggleTheme}
      className={`px-4 py-2 rounded-full font-semibold text-sm transition-all duration-300 shadow-md border
        ${
          isLight
            ? 'bg-gray-200 text-gray-800 border-gray-400 hover:bg-gray-300'
            : 'bg-gray-800 text-gray-100 border-gray-600 hover:bg-gray-700'
        }`}
    >
      {isLight ? 'Dark Mode' : 'Light Mode'}
    </button>
  );
}
