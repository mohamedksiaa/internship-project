import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import DailyReportComposer from './DailyReportComposer';

const { getMyDailyReports, saveDailyReport, updateDailyReport, deleteDailyReport } = vi.hoisted(() => ({
  getMyDailyReports: vi.fn(),
  saveDailyReport: vi.fn(),
  updateDailyReport: vi.fn(),
  deleteDailyReport: vi.fn(),
}));

vi.mock('../../api/timeflowApi', () => ({
  getMyDailyReports,
  saveDailyReport,
  updateDailyReport,
  deleteDailyReport,
}));

describe('DailyReportComposer', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
    getMyDailyReports.mockReset();
    saveDailyReport.mockReset();
    updateDailyReport.mockReset();
    deleteDailyReport.mockReset();
    window.confirm = vi.fn(() => true);
  });

  it('shows the real status and manual-edit badge on recent validated cards', async () => {
    const recentTime = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    getMyDailyReports.mockResolvedValue([
      {
        id: 15,
        date_report: '2026-08-26',
        content: 'Rapport validé récent',
        status: 2,
        date_creation: '2026-08-26T08:00:00Z',
        date_last_content_edit: '2026-08-26T09:45:00Z',
        is_deleted: false,
        is_read: true,
        read_at: recentTime,
      },
    ]);

    render(<DailyReportComposer />);

    const readButton = (await screen.findAllByRole('button', { name: /Lire le rapport/i }))[0];
    fireEvent.click(readButton);

    expect(await screen.findByText('Rapport validé récent')).toBeInTheDocument();
    expect(screen.getByText('Validé')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Modifié manuellement/i })).toBeInTheDocument();
  });

  it('can save a draft without sending it to validation', async () => {
    getMyDailyReports.mockResolvedValue([]);
    saveDailyReport.mockResolvedValue({
      id: 99,
      date_report: '2026-08-12',
      content: 'Brouillon à garder',
      status: 0,
      is_deleted: false,
      is_read: false,
      read_at: null,
    });

    render(<DailyReportComposer />);

    fireEvent.change(screen.getByLabelText(/Date du rapport/i), {
      target: { value: '2026-08-12' },
    });
    fireEvent.change(screen.getByLabelText(/Compte-rendu/i), {
      target: { value: 'Brouillon à garder' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Enregistrer comme brouillon/i }));

    await waitFor(() => expect(saveDailyReport).toHaveBeenCalledWith('2026-08-12', 'Brouillon à garder', 0));
  });

  it('hides validated reports older than 24h but keeps rejected records visible', async () => {
    const now = Date.now();
    getMyDailyReports.mockResolvedValue([
      { id: 50, date_report: '2026-08-10', content: 'Ancien rapport validé tombé hors delai', status: 2, date_creation: '2026-08-10T08:00:00Z', date_modification: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(), read_at: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(), is_deleted: false, is_read: true },
      { id: 51, date_report: '2026-08-09', content: 'Rapport rejeté ancien mais conservé', status: 9, date_creation: '2026-08-09T08:00:00Z', date_modification: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(), read_at: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(), is_deleted: false, is_read: true },
      { id: 52, date_report: '2026-08-12', content: 'Rapport récent validé', status: 2, date_creation: '2026-08-12T08:00:00Z', date_modification: new Date(now - 2 * 60 * 60 * 1000).toISOString(), read_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(), is_deleted: false, is_read: true },
    ]);

    render(<DailyReportComposer />);

    await waitFor(() => expect(screen.queryByText('Ancien rapport validé tombé hors delai')).not.toBeInTheDocument());

    const readButtons = screen.getAllByRole('button', { name: /Lire le rapport/i });
    expect(readButtons).toHaveLength(2);

    fireEvent.click(readButtons[0]);
    expect(await screen.findByText('Rapport rejeté ancien mais conservé')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /Fermer/i }).at(-1));
    fireEvent.click(readButtons[1]);
    expect(await screen.findByText('Rapport récent validé')).toBeInTheDocument();
  });

  it('hides the edit action for validated reports and shows send for drafts', async () => {
    getMyDailyReports.mockResolvedValue([
      { id: 60, date_report: '2026-08-26', content: 'Rapport validé non éditable', status: 2, date_creation: '2026-08-26T08:00:00Z', is_deleted: false, is_read: true, read_at: '2026-08-26T08:00:00Z' },
      { id: 61, date_report: '2026-08-27', content: 'Brouillon à envoyer', status: 0, date_creation: '2026-08-27T08:00:00Z', is_deleted: false, is_read: false, read_at: null },
    ]);
    updateDailyReport.mockResolvedValue({
      id: 61,
      date_report: '2026-08-27',
      content: 'Brouillon à envoyer',
      status: 1,
      is_deleted: false,
      is_read: false,
      read_at: null,
    });

    render(<DailyReportComposer />);

    const validCard = (await screen.findByText('2026-08-26')).closest('article');
    expect(within(validCard).queryByRole('button', { name: /Modifier/i })).not.toBeInTheDocument();

    const draftCard = (await screen.findByText('2026-08-27')).closest('article');
    await waitFor(() => expect(within(draftCard).getByRole('button', { name: /Envoyer le rapport/i })).toBeInTheDocument());

    fireEvent.click(within(draftCard).getByRole('button', { name: /Envoyer le rapport/i }));
    await waitFor(() => expect(updateDailyReport).toHaveBeenCalledWith(61, 'Brouillon à envoyer', 1));
  });

  it('deletes a draft report and hides the delete action for non-draft reports', async () => {
    getMyDailyReports.mockResolvedValue([
      { id: 42, date_report: '2026-08-12', content: 'Brouillon à supprimer', status: 0, date_creation: '2026-08-12T08:00:00Z', is_deleted: false, is_read: false, read_at: null },
      { id: 43, date_report: '2026-08-13', content: 'Rapport déjà envoyé', status: 1, date_creation: '2026-08-13T08:00:00Z', is_deleted: false, is_read: false, read_at: null },
    ]);
    deleteDailyReport.mockResolvedValue({ status: 'success', data: { id: 42, is_deleted: true } });

    render(<DailyReportComposer />);

    const draftDeleteButton = await screen.findByRole('button', { name: /Supprimer/i });
    expect(draftDeleteButton).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /Supprimer/i })).toHaveLength(1);

    fireEvent.click(draftDeleteButton);

    await waitFor(() => expect(deleteDailyReport).toHaveBeenCalledWith(42));
    await waitFor(() => expect(screen.queryByText('Brouillon à supprimer')).not.toBeInTheDocument());
  });

  it('rejects a delete attempt when the API denies a non-draft report', async () => {
    getMyDailyReports.mockResolvedValue([
      { id: 44, date_report: '2026-08-14', content: 'Rapport soumis', status: 1, date_creation: '2026-08-14T08:00:00Z', is_deleted: false, is_read: false, read_at: null },
    ]);

    render(<DailyReportComposer />);

    expect(screen.queryByRole('button', { name: /Supprimer/i })).not.toBeInTheDocument();

    deleteDailyReport.mockRejectedValueOnce(new Error('Seuls les brouillons peuvent être supprimés par l’employé.'));
    await expect(deleteDailyReport(44)).rejects.toThrow('Seuls les brouillons peuvent être supprimés par l’employé.');
    expect(deleteDailyReport).toHaveBeenCalledWith(44);
  });
});
