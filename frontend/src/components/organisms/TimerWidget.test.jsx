import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import TimerWidget from './TimerWidget';

const t = (key) => i18n.t(key);

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
    await user.type(screen.getByLabelText(t('timer_widget.description_label')), 'Analyse');
    await user.type(screen.getByLabelText(t('timer_widget.project_label')), 'Projet A');
    rerender(<TimerWidget timer={{ isRunning: true, seconds: 2, loading: false, start: vi.fn(), stop }} onEntryCreated={onEntryCreated} />);
    await user.click(screen.getByRole('button', { name: t('timer_widget.stop') }));
    expect(screen.getByLabelText(t('timer_widget.description_label'))).toHaveValue('');
    expect(screen.getByLabelText(t('timer_widget.project_label'))).toHaveValue('');
    expect(onEntryCreated).toHaveBeenCalledWith(stopped);
  });

  it('disables START when both fields are empty', () => {
    renderTimerWidget();
    expect(screen.getByRole('button', { name: t('timer_widget.start') })).toBeDisabled();
  });

  it('disables START when project is filled but description is empty', async () => {
    const user = userEvent.setup();
    renderTimerWidget();
    await user.type(screen.getByLabelText(t('timer_widget.project_label')), 'Projet Alpha');
    expect(screen.getByRole('button', { name: t('timer_widget.start') })).toBeDisabled();
  });

  it('disables START when description is shorter than 3 characters', async () => {
    const user = userEvent.setup();
    renderTimerWidget();
    await user.type(screen.getByLabelText(t('timer_widget.project_label')), 'Projet Alpha');
    await user.type(screen.getByLabelText(t('timer_widget.description_label')), 'ab');
    expect(screen.getByRole('button', { name: t('timer_widget.start') })).toBeDisabled();
  });

  it('disables START when description has 3 characters but project is empty', async () => {
    const user = userEvent.setup();
    renderTimerWidget();
    await user.type(screen.getByLabelText(t('timer_widget.description_label')), 'abc');
    expect(screen.getByRole('button', { name: t('timer_widget.start') })).toBeDisabled();
  });

  it('enables START when project is filled and description has at least 3 characters', async () => {
    const user = userEvent.setup();
    renderTimerWidget();
    await user.type(screen.getByLabelText(t('timer_widget.project_label')), 'Projet Alpha');
    await user.type(screen.getByLabelText(t('timer_widget.description_label')), 'abc');
    expect(screen.getByRole('button', { name: t('timer_widget.start') })).toBeEnabled();
  });

  it('trims whitespace before validating the description length', async () => {
    const user = userEvent.setup();
    renderTimerWidget();
    await user.type(screen.getByLabelText(t('timer_widget.project_label')), 'Projet Alpha');
    await user.type(screen.getByLabelText(t('timer_widget.description_label')), '  a  ');
    expect(screen.getByRole('button', { name: t('timer_widget.start') })).toBeDisabled();
  });

  it('shows a visible validation hint when fields are missing', () => {
    renderTimerWidget();
    expect(screen.queryByText(/Veuillez renseigner un projet/)).not.toBeInTheDocument();
    expect(screen.queryByText(/3 caractères/)).not.toBeInTheDocument();
  });
});