import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import DemoLayout from './DemoLayout';

describe('DemoLayout', () => {
  it('shows the PRism header with a sign-in link above the content', () => {
    render(
      <DemoLayout>
        <p>sample content</p>
      </DemoLayout>,
    );

    const banner = screen.getByRole('banner');

    expect(banner.textContent).toContain('PRism');
    expect(banner.textContent).toContain('sample data');
    expect(banner.querySelector('a[href="/login"]')).toBeTruthy();
    expect(screen.getByText('sample content')).toBeTruthy();
  });
});
