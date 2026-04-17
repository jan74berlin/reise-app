import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

jest.mock('../stores/authStore', () => ({ useAuthStore: (sel: any) => sel({ token: 'tok' }) }));
jest.mock('../api/pn');

import { searchPn } from '../api/pn';
import { PnSearchSheet } from '../components/PnSearchSheet';
import type { PnSpot } from '../api/pn';

const mockSpot: PnSpot = {
  id: 42,
  lat: 54.321,
  lng: 25.123,
  title_short: 'Camping Test',
  type: { code: 'PN' },
  rating: 4.2,
  review: 15,
};

const defaultProps = {
  visible: true,
  lat: 54.0,
  lng: 25.0,
  onClose: jest.fn(),
  onSelect: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  (searchPn as jest.Mock).mockResolvedValue({ spots: [mockSpot] });
});

test('PnSearchSheet shows loading when visible', async () => {
  // Delay the resolution to catch loading state
  let resolve: (val: any) => void;
  (searchPn as jest.Mock).mockReturnValue(new Promise((res) => { resolve = res; }));

  const { getByTestId } = render(<PnSearchSheet {...defaultProps} />);
  await waitFor(() => expect(getByTestId('search-loading')).toBeTruthy());
});

test('PnSearchSheet renders spots after search', async () => {
  const { getByTestId } = render(<PnSearchSheet {...defaultProps} />);
  await waitFor(() => expect(getByTestId('spot-item-42')).toBeTruthy());
});

test('PnSearchSheet shows role selector after spot tap', async () => {
  const { getByTestId } = render(<PnSearchSheet {...defaultProps} />);
  await waitFor(() => getByTestId('spot-item-42'));
  fireEvent.press(getByTestId('spot-item-42'));
  await waitFor(() => expect(getByTestId('selected-spot-name')).toBeTruthy());
});

test('PnSearchSheet calls onSelect with spot and role', async () => {
  const onSelect = jest.fn();
  const { getByTestId } = render(<PnSearchSheet {...defaultProps} onSelect={onSelect} />);
  await waitFor(() => getByTestId('spot-item-42'));
  fireEvent.press(getByTestId('spot-item-42'));
  await waitFor(() => getByTestId('role-btn-primary'));
  fireEvent.press(getByTestId('role-btn-primary'));
  expect(onSelect).toHaveBeenCalledWith(mockSpot, 'primary');
});

test('PnSearchSheet shows empty state when no spots returned', async () => {
  (searchPn as jest.Mock).mockResolvedValue({ spots: [] });
  const { getByTestId } = render(<PnSearchSheet {...defaultProps} />);
  await waitFor(() => expect(getByTestId('empty-results')).toBeTruthy());
});
