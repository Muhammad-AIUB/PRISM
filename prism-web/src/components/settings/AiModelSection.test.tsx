import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAiSettings, listAiModels, saveAiSettings } from '@/app/settings/actions';
import type { AiSettings } from '@/lib/types';
import AiModelSection from './AiModelSection';

vi.mock('@/app/settings/actions', () => ({
  listAiModels: vi.fn(),
  saveAiSettings: vi.fn(),
  clearAiSettings: vi.fn(),
}));

const base: AiSettings = {
  default: { provider: 'groq', models: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'] },
  own: null,
  providers: [
    { id: 'openai', label: 'OpenAI' },
    { id: 'anthropic', label: 'Anthropic Claude' },
  ],
};

describe('AiModelSection', () => {
  beforeEach(() => vi.resetAllMocks());

  it('says the default model is used when nothing is saved', () => {
    render(<AiModelSection settings={base} />);

    expect(screen.getByText(/Using PRism's default model/i)).toBeInTheDocument();
  });

  it('states plainly that this is an API key and not a subscription', () => {
    render(<AiModelSection settings={base} />);

    expect(screen.getByText(/not a ChatGPT or Claude subscription/i)).toBeInTheDocument();
  });

  it('loads the provider models after a key is entered, and only then enables Save', async () => {
    vi.mocked(listAiModels).mockResolvedValue({ ok: true, message: '', models: ['gpt-4.1'] });
    render(<AiModelSection settings={base} />);

    await userEvent.selectOptions(screen.getByLabelText('Provider'), 'openai');
    await userEvent.type(screen.getByLabelText('API key'), 'sk-test-1234');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Load models' }));
    await userEvent.selectOptions(await screen.findByLabelText('Model'), 'gpt-4.1');

    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('shows the provider error when the key is rejected', async () => {
    vi.mocked(listAiModels).mockResolvedValue({
      ok: false,
      message: 'OpenAI rejected this API key.',
      errors: { api_key: ['OpenAI rejected this API key.'] },
    });
    render(<AiModelSection settings={base} />);

    await userEvent.selectOptions(screen.getByLabelText('Provider'), 'openai');
    await userEvent.type(screen.getByLabelText('API key'), 'bad');
    await userEvent.click(screen.getByRole('button', { name: 'Load models' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('OpenAI rejected this API key.');
  });

  it('clears the key field after a successful save', async () => {
    vi.mocked(listAiModels).mockResolvedValue({ ok: true, message: '', models: ['gpt-4.1'] });
    vi.mocked(saveAiSettings).mockResolvedValue({ ok: true, message: 'Your AI model was saved.' });
    render(<AiModelSection settings={base} />);

    await userEvent.selectOptions(screen.getByLabelText('Provider'), 'openai');
    await userEvent.type(screen.getByLabelText('API key'), 'sk-test-1234');
    await userEvent.click(screen.getByRole('button', { name: 'Load models' }));
    await userEvent.selectOptions(await screen.findByLabelText('Model'), 'gpt-4.1');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Your AI model was saved.')).toBeInTheDocument();
    expect(screen.getByLabelText('API key')).toHaveValue('');
  });

  it('shows a saved model with only the key hint, and offers to switch back', async () => {
    vi.mocked(clearAiSettings).mockResolvedValue({ ok: true, message: 'ok' });
    render(
      <AiModelSection
        settings={{ ...base, own: { provider: 'openai', model: 'gpt-4.1', key_hint: '9999', updated_at: null } }}
      />,
    );

    expect(screen.getByText(/gpt-4\.1/)).toBeInTheDocument();
    expect(screen.getByText(/key ending 9999/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Use PRism's default/i }));
    expect(clearAiSettings).toHaveBeenCalled();
  });
});
