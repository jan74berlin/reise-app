import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
}));
jest.mock('expo-router', () => ({ useRouter: jest.fn(() => ({ push: jest.fn() })) }));
jest.mock('../stores/authStore', () => ({ useAuthStore: (sel: any) => sel({ token: 'tok' }) }));
jest.mock('../api/trips');

import { useQuery } from '@tanstack/react-query';
import TripsScreen from '../app/(app)/index';
import { TripCard } from '../components/TripCard';

const mockTrip = {
  id: '1',
  title: 'Baltikum 2026',
  description: 'Eine tolle Reise',
  start_date: '2026-06-01',
  end_date: '2026-08-31',
  vehicle_height: null,
  vehicle_length: null,
  vehicle_weight: null,
  vehicle_fuel: null,
  created_at: '2026-01-01T00:00:00Z',
};

test('TripsScreen shows ActivityIndicator when loading', () => {
  (useQuery as jest.Mock).mockReturnValue({ isLoading: true, data: undefined, refetch: jest.fn(), isRefetching: false, isError: false });
  const { getByTestId } = render(<TripsScreen />);
  expect(getByTestId('loading-indicator')).toBeTruthy();
});

test('TripsScreen renders TripCard for each trip', async () => {
  (useQuery as jest.Mock).mockReturnValue({ isLoading: false, data: [mockTrip], refetch: jest.fn(), isRefetching: false, isError: false });
  const { getByText } = render(<TripsScreen />);
  await waitFor(() => expect(getByText('Baltikum 2026')).toBeTruthy());
});

test('TripsScreen shows empty message when no trips', () => {
  (useQuery as jest.Mock).mockReturnValue({ isLoading: false, data: [], refetch: jest.fn(), isRefetching: false, isError: false });
  const { getByText } = render(<TripsScreen />);
  expect(getByText('Keine Reisen vorhanden.')).toBeTruthy();
});

test('TripsScreen shows error message on query failure', () => {
  (useQuery as jest.Mock).mockReturnValue({ isLoading: false, isError: true, data: undefined, refetch: jest.fn(), isRefetching: false });
  const { getByTestId } = render(<TripsScreen />);
  expect(getByTestId('error-message')).toBeTruthy();
});

test('TripCard renders title and dates', () => {
  const { getByText } = render(<TripCard trip={mockTrip} onPress={() => {}} />);
  expect(getByText('Baltikum 2026')).toBeTruthy();
  expect(getByText('2026-06-01 – 2026-08-31')).toBeTruthy();
});
