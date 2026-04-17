import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
  useMutation: jest.fn(),
  useQueryClient: jest.fn(() => ({ invalidateQueries: jest.fn() })),
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(() => ({ id: 'trip-1' })),
}));
jest.mock('../stores/authStore', () => ({ useAuthStore: (sel: any) => sel({ token: 'tok' }) }));
jest.mock('../api/journal');
jest.mock('expo-image-picker');

import { useQuery } from '@tanstack/react-query';
import JournalScreen from '../app/(app)/trips/[id]/journal';
import { JournalEntryCard } from '../components/JournalEntryCard';
import { createEntry } from '../api/journal';
import type { JournalEntry } from '@/api/journal';

const mockEntry: JournalEntry = {
  id: 'e1',
  trip_id: 'trip-1',
  night_id: null,
  user_id: null,
  text: 'Ein schöner Tag',
  created_at: '2026-06-01T12:00:00Z',
  updated_at: '2026-06-01T12:00:00Z',
  media: [],
};

test('JournalScreen shows loading indicator', () => {
  (useQuery as jest.Mock).mockReturnValue({ isLoading: true, data: undefined });
  const { getByTestId } = render(<JournalScreen />);
  expect(getByTestId('loading-indicator')).toBeTruthy();
});

test('JournalScreen shows empty state when no entries', () => {
  (useQuery as jest.Mock).mockReturnValue({ isLoading: false, data: [] });
  const { getByTestId } = render(<JournalScreen />);
  expect(getByTestId('empty-state')).toBeTruthy();
});

test('JournalScreen renders journal entries', async () => {
  (useQuery as jest.Mock).mockReturnValue({ isLoading: false, data: [mockEntry] });
  const { getByText } = render(<JournalScreen />);
  await waitFor(() => expect(getByText('Ein schöner Tag')).toBeTruthy());
});

test('JournalScreen calls createEntry on send', async () => {
  (useQuery as jest.Mock).mockReturnValue({ isLoading: false, data: [] });
  (createEntry as jest.Mock).mockResolvedValue({ entry: mockEntry });

  const { getByTestId } = render(<JournalScreen />);
  fireEvent.changeText(getByTestId('text-input'), 'Neuer Eintrag');
  fireEvent.press(getByTestId('send-btn'));

  await waitFor(() => expect(createEntry).toHaveBeenCalledWith('tok', 'trip-1', 'Neuer Eintrag'));
});

test('JournalEntryCard renders entry text and date', () => {
  const { getByText } = render(<JournalEntryCard entry={mockEntry} />);
  expect(getByText('Ein schöner Tag')).toBeTruthy();
  // Date should be formatted
  expect(getByText(/01\.06\.2026/)).toBeTruthy();
});
