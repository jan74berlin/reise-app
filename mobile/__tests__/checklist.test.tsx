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
jest.mock('../api/checklist');

import { useQuery, useMutation } from '@tanstack/react-query';
import ChecklistScreen from '../app/(app)/trips/[id]/checklist';
import { addItem, toggleItem, deleteItem } from '../api/checklist';
import type { ChecklistItem } from '@/api/checklist';

const mockItem: ChecklistItem = {
  id: 'i1',
  trip_id: 'trip-1',
  category: 'Camping',
  text: 'Schlafsack',
  is_checked: false,
  checked_by: null,
  checked_at: null,
};

const mockCheckedItem: ChecklistItem = { ...mockItem, id: 'i2', text: 'Zelt', is_checked: true };

beforeEach(() => {
  jest.clearAllMocks();
  (useMutation as jest.Mock).mockImplementation(({ mutationFn, onSuccess }) => ({
    mutate: (args: any) => {
      mutationFn(args).then(() => onSuccess?.());
    },
    isPending: false,
  }));
});

test('ChecklistScreen shows loading indicator', () => {
  (useQuery as jest.Mock).mockReturnValue({ isLoading: true, data: undefined });
  const { getByTestId } = render(<ChecklistScreen />);
  expect(getByTestId('loading-indicator')).toBeTruthy();
});

test('ChecklistScreen renders items', async () => {
  (useQuery as jest.Mock).mockReturnValue({ isLoading: false, data: [mockItem] });
  const { getByText } = render(<ChecklistScreen />);
  await waitFor(() => expect(getByText('Schlafsack')).toBeTruthy());
});

test('ChecklistScreen shows correct progress', async () => {
  (useQuery as jest.Mock).mockReturnValue({ isLoading: false, data: [mockItem, mockCheckedItem] });
  const { getByTestId } = render(<ChecklistScreen />);
  const progressNode = getByTestId('progress-text');
  // The text may be split into multiple children nodes; check the full text content
  expect(progressNode).toBeTruthy();
  const textContent = progressNode.props.children;
  // Join all children into a string to check regardless of how RN splits text nodes
  const joined = Array.isArray(textContent) ? textContent.join('') : String(textContent);
  expect(joined).toBe('1/2 erledigt');
});

test('ChecklistScreen calls addItem on add button press', async () => {
  (useQuery as jest.Mock).mockReturnValue({ isLoading: false, data: [] });
  (addItem as jest.Mock).mockResolvedValue({ item: mockItem });

  const { getByTestId } = render(<ChecklistScreen />);
  fireEvent.changeText(getByTestId('text-input'), 'Schlafsack');
  fireEvent.press(getByTestId('add-btn'));

  await waitFor(() => expect(addItem).toHaveBeenCalledWith('tok', 'trip-1', 'Schlafsack', undefined));
});

test('ChecklistScreen calls toggleItem on checkbox press', async () => {
  (useQuery as jest.Mock).mockReturnValue({ isLoading: false, data: [mockItem] });
  (toggleItem as jest.Mock).mockResolvedValue({ item: { ...mockItem, is_checked: true } });

  const { getByTestId } = render(<ChecklistScreen />);
  await waitFor(() => getByTestId('toggle-i1'));
  fireEvent.press(getByTestId('toggle-i1'));

  await waitFor(() => expect(toggleItem).toHaveBeenCalledWith('tok', 'trip-1', 'i1', true));
});

test('ChecklistScreen calls deleteItem on delete press', async () => {
  (useQuery as jest.Mock).mockReturnValue({ isLoading: false, data: [mockItem] });
  (deleteItem as jest.Mock).mockResolvedValue(undefined);

  const { getByTestId } = render(<ChecklistScreen />);
  await waitFor(() => getByTestId('delete-i1'));
  fireEvent.press(getByTestId('delete-i1'));

  await waitFor(() => expect(deleteItem).toHaveBeenCalledWith('tok', 'trip-1', 'i1'));
});
