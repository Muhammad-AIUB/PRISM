'use client';

import { Cpu, Loader2, Save } from 'lucide-react';
import { useState, useTransition } from 'react';
import { clearAiSettings, listAiModels, saveAiSettings } from '@/app/settings/actions';
import type { AiSettings } from '@/lib/types';

/**
 * Optional own AI provider (ADR 0012). The key goes to the server once, is
 * stored encrypted there and is never rendered back: only its last four
 * characters come back from the API.
 */
export default function AiModelSection({ settings }: { settings: AiSettings }) {
  const { own, providers } = settings;
  const [provider, setProvider] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const labelOf = (id: string) => providers.find((p) => p.id === id)?.label ?? id;

  const changeProvider = (value: string) => {
    setProvider(value);
    setModels([]);
    setModel('');
    setError(null);
  };

  const load = () => {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await listAiModels(provider, apiKey.trim() || undefined);

      if (!result.ok) {
        setError(result.errors?.['api_key']?.[0] ?? result.message);
        return;
      }

      setModels(result.models ?? []);
      setModel('');
    });
  };

  const save = () => {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await saveAiSettings({
        provider,
        model,
        apiKey: apiKey.trim() || undefined,
      });

      if (!result.ok) {
        setError(result.errors?.['model']?.[0] ?? result.errors?.['api_key']?.[0] ?? result.message);
        return;
      }

      setApiKey('');
      setModels([]);
      setModel('');
      setProvider('');
      setNotice(result.message);
    });
  };

  const useDefault = () => {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await clearAiSettings();

      if (!result.ok) {
        setError(result.message);
        return;
      }

      setNotice(result.message);
    });
  };

  return (
    <section className="card-flat p-5 sm:p-6">
      <h2
        className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider"
        style={{ color: 'var(--text-muted)' }}
      >
        <Cpu className="h-4 w-4" /> AI model
      </h2>
      <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
        By default PRism reviews your code with its own Groq models. You can use your own AI provider instead.
      </p>
      <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
        This takes an API key, not a ChatGPT or Claude subscription. API usage is billed separately by the
        provider.
      </p>
      <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
        If you save a key, the code of your reviews is sent to that provider. If it fails, PRism falls back to
        its default model.
      </p>

      <div
        className="mt-4 rounded-md p-4"
        style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
      >
        {own ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
              Using {labelOf(own.provider)} · {own.model} · key ending {own.key_hint}
            </p>
            <button
              type="button"
              onClick={useDefault}
              disabled={pending}
              className="btn btn-secondary min-h-[44px] shrink-0 transition active:scale-95"
            >
              Use PRism&apos;s default (Groq)
            </button>
          </div>
        ) : (
          <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
            Using PRism&apos;s default model.
          </p>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          Provider
          <select
            value={provider}
            onChange={(event) => changeProvider(event.target.value)}
            className="input mt-1 min-h-[44px] w-full text-sm"
          >
            <option value="">Choose a provider</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          API key
          <input
            type="password"
            autoComplete="off"
            maxLength={512}
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={own && own.provider === provider ? `Saved, ending ${own.key_hint}` : ''}
            className="input mt-1 min-h-[44px] w-full text-sm"
          />
        </label>

        {models.length > 0 && (
          <label className="text-sm font-medium sm:col-span-2" style={{ color: 'var(--text-primary)' }}>
            Model
            <select
              value={model}
              onChange={(event) => setModel(event.target.value)}
              className="input mt-1 min-h-[44px] w-full text-sm"
            >
              <option value="">Choose a model</option>
              {models.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-3 text-sm" style={{ color: 'var(--success)' }}>
          {notice}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={load}
          disabled={!provider || (!apiKey.trim() && own?.provider !== provider) || pending}
          className="btn btn-secondary min-h-[44px] transition active:scale-95"
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Load models
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!provider || !model || pending}
          className="btn btn-primary min-h-[44px] transition active:scale-95"
        >
          <Save className="h-4 w-4" />
          Save
        </button>
      </div>
    </section>
  );
}
