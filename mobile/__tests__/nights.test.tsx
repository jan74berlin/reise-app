import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

jest.mock('@tanstack/react-query', () => ({ useQuery: jest.fn() }));
jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn() })),
  useLocalSearchParams: jest.fn(() => ({ id: 'trip-1' })),
}));
jest.mock('../stores/authStore', () => ({ useAuthStore: (sel: any) => sel({ token: 'tok' }) }));
jest.mock('../api/nights');

import { useQuery } from '@tanstack/react-query';
import TripDetailScreen from '../app/(app)/trips/[id]/index';
import { NightCard } from '../components/NightCard';
import type { Night } from '@/api/nights';

const mockNight: Night = {
  id: 'n1',
  night_number: 1,
  date: '2026-06-01',
  lat_center: '54.0',
  lng_center: '25.0',
  notes: null,
  spots: [{ night_spot_id: 's1', role: 'primary', is_selected: true, notes: null, pn_id: 123, lat: '54.0', lng: '25.0', title: 'Camping Litauen', type_code: null, rating: '4.5', reviews: 12 }],
  sights: [{ id: 'si1', name: 'Vilnius', description: null, url: null }],
};

test('TripDetailScreen shows loading indicator', () => {
  (useQuery as jest.Mock).mockReturnValue({ isLoading: true, isError: false, data: undefined });
  const { getByTestId } = render(<TripDetailScreen />);
  expect(getByTestId('loading-indicator')).toBeTruthy();
});

test('TripDetailScreen renders NightCards', async () => {
  (useQuery as jest.Mock).mockReturnValue({ isLoading: false, isError: false, data: [mockNight] });
  const { getByText } = render(<TripDetailScreen />);
  await waitFor(() => expect(getByText('Nacht 1')).toBeTruthy());
});

test('TripDetailScreen shows error on failure', () => {
  (useQuery as jest.Mock).mockReturnValue({ isLoading: false, isError: true, data: undefined });
  const { getByText } = render(<TripDetailScreen />);
  expect(getByText('Etappen konnten nicht geladen werden.')).toBeTruthy();
});

test('NightCard renders night number, date, and spot title', () => {
  const { getByText } = render(<NightCard night={mockNight} onPress={() => {}} />);
  expect(getByText('Nacht 1')).toBeTruthy();
  expect(getByText('2026-06-01')).toBeTruthy();
  expect(getByText('Camping Litauen')).toBeTruthy();
});

test('NightCard shows sight count', () => {
  const { getByText } = render(<NightCard night={mockNight} onPress={() => {}} />);
  expect(getByText('1 Sehenswürdigkeit')).toBeTruthy();
});
