import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ThemeSync from './ThemeSync';

afterEach(() => {
  localStorage.clear();
  document.documentElement.className = '';
});

describe('ThemeSync', () => {
  // What React leaves behind when it client-renders the root layout for notFound().
  it('restores a saved light theme over the server default', () => {
    localStorage.setItem('prism-theme', 'light');
    document.documentElement.className = 'dark';

    render(<ThemeSync />);

    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('falls back to dark with nothing saved', () => {
    document.documentElement.className = 'light';

    render(<ThemeSync />);

    expect(document.documentElement.className).toBe('dark');
  });
});
