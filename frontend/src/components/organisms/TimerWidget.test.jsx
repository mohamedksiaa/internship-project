import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import TimerWidget from './TimerWidget';

const t = (key) => i18n.t(key);

const projects = [
  { id: 1, title: 'Projet Alpha', client: 'Client A' },
  { id: 2, title: 'Projet Beta', client: 'Client B' },
];

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
  return render(<TimerWidget timer={timer} projects={projects} onEntryCreated={vi.fn()} />);
}

describe('TimerWidget', () => {
  it('clears controlled description and project only after a successful stop', async () => {
    const user = userEvent.setup();
    const stopped = { id: 7, note: 'Analyse', fk_project: 1, duration: 2 };
    const stop = vi.fn().mockResolvedValue(stopped);
    const onEntryCreated = vi.fn();
    const { rerender } = render(<TimerWidget timer={{ isRunning: false, seconds: 0, loading: false, start: vi.fn(), stop }} projects={projects} onEntryCreated={onEntryCreated} />);
    await user.type(screen.getByLabelText(t('timer_widget.description_label')), 'Analyse');
    await user.selectOptions(screen.getByLabelText(t('timer_widget.project_label')), '1');
    rerender(<TimerWidget timer={{ isRunning: true, seconds: 2, loading: false, start: vi.fn(), stop }} projects={projects} onEntryCreated={onEntryCreated} />);
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
    await user.selectOptions(screen.getByLabelText(t('timer_widget.project_label')), '1');
    expect(screen.getByRole('button', { name: t('timer_widget.start') })).toBeDisabled();
  });

  it('disables START when description is shorter than 3 characters', async () => {
    const user = userEvent.setup();
    renderTimerWidget();
    await user.selectOptions(screen.getByLabelText(t('timer_widget.project_label')), '1');
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
    await user.selectOptions(screen.getByLabelText(t('timer_widget.project_label')), '1');
    await user.type(screen.getByLabelText(t('timer_widget.description_label')), 'abc');
    expect(screen.getByRole('button', { name: t('timer_widget.start') })).toBeEnabled();
  });

  it('trims whitespace before validating the description length', async () => {
    const user = userEvent.setup();
    renderTimerWidget();
    await user.selectOptions(screen.getByLabelText(t('timer_widget.project_label')), '1');
    await user.type(screen.getByLabelText(t('timer_widget.description_label')), '  a  ');
    expect(screen.getByRole('button', { name: t('timer_widget.start') })).toBeDisabled();
  });

  it('only lists projects passed via the projects prop', () => {
    renderTimerWidget();
    expect(screen.getByRole('option', { name: 'Projet Alpha' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Projet Beta' })).toBeInTheDocument();
  });

  it('shows a visible validation hint when fields are missing', () => {
    renderTimerWidget();
    expect(screen.queryByText(/Veuillez renseigner un projet/)).not.toBeInTheDocument();
    expect(screen.queryByText(/3 caractères/)).not.toBeInTheDocument();
  });

  it('shows a discreet warning once a running timer passes 12h, without stopping it', () => {
    renderTimerWidget({ isRunning: true, seconds: 12 * 3600 + 1 });
    expect(screen.getByText((_, element) => element?.textContent === `⚠ ${t('timer_widget.long_running_warning')}`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('timer_widget.stop') })).toBeEnabled();
  });

  it('does not warn for a running timer under 12h', () => {
    renderTimerWidget({ isRunning: true, seconds: 3600 });
    expect(screen.queryByText((_, element) => element?.textContent === `⚠ ${t('timer_widget.long_running_warning')}`)).not.toBeInTheDocument();
  });

  it('pushes every midnight-split segment plus the final entry after stopping a too-long timer', async () => {
    const user = userEvent.setup();
    const finalSegment = { id: 9, note: 'Oubli', fk_project: 1, duration: 4 * 3600, fk_split_previous: 8 };
    const firstSegment = { id: 8, note: 'Oubli', fk_project: 1, duration: 15 * 3600 };
    const stop = vi.fn().mockResolvedValue({ ...finalSegment, split_segments: [firstSegment] });
    const onEntryCreated = vi.fn();
    render(<TimerWidget timer={{ isRunning: true, seconds: 19 * 3600, loading: false, start: vi.fn(), stop }} projects={projects} onEntryCreated={onEntryCreated} />);

    await user.click(screen.getByRole('button', { name: t('timer_widget.stop') }));

    expect(onEntryCreated).toHaveBeenCalledTimes(2);
    expect(onEntryCreated).toHaveBeenCalledWith(firstSegment);
    expect(onEntryCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 9 }));
  });
});
