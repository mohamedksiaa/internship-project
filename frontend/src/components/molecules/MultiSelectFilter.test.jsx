import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MultiSelectFilter from './MultiSelectFilter';

const OPTIONS = [
  { id: 1, label: 'Alpha' },
  { id: 2, label: 'Beta', note: 'clos' },
  { id: 3, label: 'Gamma' },
];
const many = Array.from({ length: 12 }, (_, i) => ({ id: 100 + i, label: `Projet ${i + 1}` }));

const baseProps = {
  id: 'f',
  label: 'Projet',
  allLabel: 'Tous',
  countLabel: (n) => `${n} sélectionnés`,
  searchPlaceholder: 'Rechercher…',
  noResultsLabel: 'Aucun résultat',
};

function Harness({ options = OPTIONS, initial = [], onChangeSpy = () => {} }) {
  const [selected, setSelected] = useState(initial);
  return (
    <MultiSelectFilter
      {...baseProps}
      options={options}
      selected={selected}
      onChange={(ids) => { setSelected(ids); onChangeSpy(ids); }}
    />
  );
}
afterEach(cleanup);
const trigger = () => screen.getByRole('button', { name: /Projet/ });

describe('MultiSelectFilter', () => {
  it('shows "Tous" for an empty selection, the name for one, a count for several', () => {
    const { rerender } = render(<MultiSelectFilter {...baseProps} options={OPTIONS} selected={[]} onChange={() => {}} />);
    expect(trigger()).toHaveTextContent('Tous');
    rerender(<MultiSelectFilter {...baseProps} options={OPTIONS} selected={['3']} onChange={() => {}} />);
    expect(trigger()).toHaveTextContent('Gamma');
    rerender(<MultiSelectFilter {...baseProps} options={OPTIONS} selected={['1', '3']} onChange={() => {}} />);
    expect(trigger()).toHaveTextContent('2 sélectionnés');
  });

  it('a selected id missing from the options (a deleted project) still counts', () => {
    render(<Harness initial={['99']} />);
    expect(trigger()).toHaveTextContent('1 sélectionnés');
  });

  it('opens a checkbox list with the options and their notes; nothing is shown until it is opened', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.queryByRole('checkbox')).toBeNull();
    await user.click(trigger());
    const group = screen.getByRole('group');
    expect(within(group).getAllByRole('checkbox')).toHaveLength(4); // "Tous" + 3
    expect(within(group).getByText('clos')).toBeInTheDocument();
    expect(within(group).getByRole('checkbox', { name: 'Tous' })).toBeChecked();
  });

  it('ticking options selects several (multiple selection); unticking removes; each change is reported', async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Harness onChangeSpy={spy} />);
    await user.click(trigger());
    await user.click(screen.getByRole('checkbox', { name: /Alpha/ }));
    await user.click(screen.getByRole('checkbox', { name: /Gamma/ }));
    expect(spy).toHaveBeenLastCalledWith(['1', '3']);
    expect(screen.getByRole('checkbox', { name: 'Tous' })).not.toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: /Alpha/ }));
    expect(spy).toHaveBeenLastCalledWith(['3']);
  });

  it('"Tous" clears the selection', async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Harness initial={['1', '2']} onChangeSpy={spy} />);
    await user.click(trigger());
    await user.click(screen.getByRole('checkbox', { name: 'Tous' }));
    expect(spy).toHaveBeenLastCalledWith([]);
    expect(trigger()).toHaveTextContent('Tous');
  });

  it('a short list has no search box; a long one has, and it filters (case-insensitive) with a no-result message', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Harness />);
    await user.click(trigger());
    expect(screen.queryByRole('searchbox')).toBeNull();
    unmount();

    render(<Harness options={many} />);
    await user.click(trigger());
    const search = screen.getByRole('searchbox', { name: 'Rechercher…' });
    await user.type(search, 'PROJET 1');
    // "Projet 1", "Projet 10", "Projet 11", "Projet 12"
    expect(within(screen.getByRole('group')).getAllByRole('checkbox').length).toBe(1 + 4);
    await user.clear(search);
    await user.type(search, 'zzz');
    expect(screen.getByText('Aucun résultat')).toBeInTheDocument();
  });

  it('a selection made while a search is active keeps the previous selection (hidden options stay selected)', async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Harness options={many} initial={['100']} onChangeSpy={spy} />);
    await user.click(trigger());
    await user.type(screen.getByRole('searchbox'), 'Projet 12');
    await user.click(screen.getByRole('checkbox', { name: /Projet 12/ }));
    expect(spy).toHaveBeenLastCalledWith(['100', '111']);
  });

  it('closes on Escape and on a click outside', async () => {
    const user = userEvent.setup();
    render(<div><Harness /><button type="button">outside</button></div>);
    await user.click(trigger());
    expect(screen.getByRole('group')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('group')).toBeNull();
    await user.click(trigger());
    await user.click(screen.getByRole('button', { name: 'outside' }));
    expect(screen.queryByRole('group')).toBeNull();
  });

  it('exposes its state to assistive technology', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger());
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
  });
});
