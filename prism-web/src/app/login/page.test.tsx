import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import LoginPage from './page';

async function renderLogin(query: { error?: string; status?: string } = {}) {
  render(await LoginPage({ searchParams: Promise.resolve(query) }));
}

describe('LoginPage', () => {
  it('signs in through the API proxy with a full navigation', async () => {
    await renderLogin();

    const link = screen.getByRole('link', { name: /continue with github/i });

    expect(link.getAttribute('href')).toBe('/auth/github');
  });

  it('offers the demo and explains what PRism does', async () => {
    await renderLogin();

    expect(screen.getByRole('link', { name: /explore the demo/i }).getAttribute('href')).toBe(
      '/demo',
    );
    expect(screen.getByRole('heading', { name: /risk radar/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /your own ai key/i })).toBeTruthy();
  });

  it('puts the PRism header above both sides', async () => {
    await renderLogin();

    const banner = screen.getByRole('banner');

    expect(banner.textContent).toContain('PRism');
    expect(banner.querySelector('a')?.getAttribute('href')).toBe('/');
    expect(screen.getByRole('heading', { name: /sign in to prism/i })).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(6);
  });

  it('shows an OAuth failure from the query string', async () => {
    await renderLogin({ error: 'GitHub sign-in failed.' });

    expect(screen.getByRole('alert').textContent).toBe('GitHub sign-in failed.');
  });
});
