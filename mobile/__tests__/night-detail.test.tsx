import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
  useMutation: jest.fn(),
  useQueryClient: jest.fn(() => ({ invalidateQueries: jest.fn() })),
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(() => ({ id: 'trip-1', n: '1' })),
}));
jest.mock('../stores/authStore', () => ({ useAuthStore: (sel: any) => sel({ token: 'tok' }) }));
jest.mock('../api/nights');

import { useQuery, useMutation } from '@tanstack/react-query';
import NightDetailScreen from '../app/(app)/trips/[id]/nights/[n]';
import { SpotCard } from '../components/SpotCard';
import type { Night, Spot } from '@/api/nights';

const mockSpot: Spot = {
  night_spot_id: 's1',
  role: 'primary',
  is_selected: false,
  notes: null,
  pn_id: 123,
  lat: '54.1234',
  lng: '25.5678',
  title: 'Camping Test',
  type_code: null,
  rating: '4.2',
  reviews: 10,
};

const mockNight: Night = {
  id: 'n1',
  night_number: 1,
  date: '2026-06-01',
  lat_center: '54.0',
  lng_center: '25.0',
  notes: 'Schöne Gegend',
  spots: [mockSpot],
  sights: [{ id: 'si1', name: 'Vilnius Old Town', description: null, url: null }],
};

beforeEach(() => {
  (useMutation as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false });
});

test('NightDetailScreen shows loading indicator', async () => {
  (useQuery as jest.Mock).mockReturnValue({ isLoading: true, data: undefined });
  const { getByTestId } = render(<NightDetailScreen />);
  expect(getByTestId('loading-indicator')).toBeTruthy();
  // flush any pending async state updates from GPS effect
  await waitFor(() => {});
});

test('NightDetailScreen renders night heading and spots', async () => {
  (useQuery as jest.Mock).mockReturnValue({ isLoading: false, data: [mockNight] });
  const { getByText } = render(<NightDetailScreen />);
  await waitFor(() => {
    expect(getByText('Nacht 1')).toBeTruthy();
    expect(getByText('Camping Test')).toBeTruthy();
  });
});

test('NightDetailScreen renders sights', async () => {
  (useQuery as jest.Mock).mockReturnValue({ isLoading: false, data: [mockNight] });
  const { getByText } = render(<NightDetailScreen />);
  await waitFor(() => expect(getByText('Vilnius Old Town')).toBeTruthy());
});

test('NightDetailScreen shows not-found when night missing', async () => {
  (useQuery as jest.Mock).mockReturnValue({ isLoading: false, data: [] });
  const { getByText } = render(<NightDetailScreen />);
  expect(getByText('Nacht nicht gefunden')).toBeTruthy();
  // flush any pending async state updates from GPS effect
  await waitFor(() => {});
});

test('SpotCard renders role label and coordinates', () => {
  const { getByText } = render(<SpotCard spot={mockSpot} />);
  // textTransform: 'uppercase' is a CSS visual-only transform; RNTL sees the raw string
  expect(getByText('Primär')).toBeTruthy();
  expect(getByText(/54\.1234/)).toBeTruthy();
});

test('SpotCard calls onSelect when Auswählen pressed', () => {
  const onSelect = jest.fn();
  const { getByTestId } = render(<SpotCard spot={mockSpot} onSelect={onSelect} />);
  fireEvent.press(getByTestId('select-btn-s1'));
  expect(onSelect).toHaveBeenCalled();
});
