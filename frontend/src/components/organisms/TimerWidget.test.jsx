import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import TimerWidget from './TimerWidget';

function renderTimerWidget(overrides = {}) {
  const timer = {
    isRunning: false,
    seconds: 0,
    loading: false,
    error: null,
    start: vi.fn().mockResolvedValue({ id: 1 }),
    stop: vi.fn().mockResolvedValue({ id: 1 }),
    ...overrides,
  };
  return render(<TimerWidget timer={timer} onEntryCreated={vi.fn()} />);
}

describe('TimerWidget', () => {
  it('clears controlled description and project only after a successful stop', async () => {
    const user = userEvent.setup();
    const stopped = { id: 7, note: 'Analyse', project_label: 'Projet A', duration: 2 };
    const stop = vi.fn().mockResolvedValue(stopped);
    const onEntryCreated = vi.fn();
    const { rerender } = render(<TimerWidget timer={{ isRunning: false, seconds: 0, loading: false, start: vi.fn(), stop }} onEntryCreated={onEntryCreated} />);
    await user.type(screen.getByLabelText('What are you working on?'), 'Analyse');
    await user.type(screen.getByLabelText('Projet'), 'Projet A');
    rerender(<TimerWidget timer={{ isRunning: true, seconds: 2, loading: false, start: vi.fn(), stop }} onEntryCreated={onEntryCreated} />);
    await user.click(screen.getByRole('button', { name: 'ARRÊTER' }));
    expect(screen.getByLabelText('What are you working on?')).toHaveValue('');
    expect(screen.getByLabelText('Projet')).toHaveValue('');
    expect(onEntryCreated).toHaveBeenCalledWith(stopped);
  });

  it('disables DÉMARRER when both fields are empty', () => {
    renderTimerWidget();
    expect(screen.getByRole('button', { name: 'DÉMARRER' })).toBeDisabled();
  });

  it('disables DÉMARRER when project is filled but description is empty', async () => {
    const user = userEvent.setup();
    renderTimerWidget();
    await user.type(screen.getByLabelText('Projet'), 'Projet Alpha');
    expect(screen.getByRole('button', { name: 'DÉMARRER' })).toBeDisabled();
  });

  it('disables DÉMARRER when description is shorter than 3 characters', async () => {
    const user = userEvent.setup();
    renderTimerWidget();
    await user.type(screen.getByLabelText('Projet'), 'Projet Alpha');
    await user.type(screen.getByLabelText('What are you working on?'), 'ab');
    expect(screen.getByRole('button', { name: 'DÉMARRER' })).toBeDisabled();
  });

  it('disables DÉMARRER when description has 3 characters but project is empty', async () => {
    const user = userEvent.setup();
    renderTimerWidget();
    await user.type(screen.getByLabelText('What are you working on?'), 'abc');
    expect(screen.getByRole('button', { name: 'DÉMARRER' })).toBeDisabled();
  });

  it('enables DÉMARRER when project is filled and description has at least 3 characters', async () => {
    const user = userEvent.setup();
    renderTimerWidget();
    await user.type(screen.getByLabelText('Projet'), 'Projet Alpha');
    await user.type(screen.getByLabelText('What are you working on?'), 'abc');
    expect(screen.getByRole('button', { name: 'DÉMARRER' })).toBeEnabled();
  });

  it('trims whitespace before validating the description length', async () => {
    const user = userEvent.setup();
    renderTimerWidget();
    await user.type(screen.getByLabelText('Projet'), 'Projet Alpha');
    await user.type(screen.getByLabelText('What are you working on?'), '  a  ');
    expect(screen.getByRole('button', { name: 'DÉMARRER' })).toBeDisabled();
  });

  it('shows a visible validation hint when fields are missing', () => {
    renderTimerWidget();
    expect(screen.queryByText(/Veuillez renseigner un projet/)).not.toBeInTheDocument();
    expect(screen.queryByText(/3 caractères/)).not.toBeInTheDocument();
  });
});