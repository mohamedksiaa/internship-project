import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Button from './Button';

describe('Button', () => {
  it('affiche le texte donné', () => {
    render(<Button>Démarrer</Button>);
    expect(screen.getByText('Démarrer')).toBeInTheDocument();
  });

  it('appelle onClick au clic', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Test</Button>);
    fireEvent.click(screen.getByText('Test'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});