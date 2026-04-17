import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(() => ({ clear: jest.fn() })),
}));
jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({ replace: jest.fn() })),
}));

const mockClearAuth = jest.fn().mockResolvedValue(undefined);
const mockUser = {
  id: 'u1',
  email: 'jan@toenhardt.de',
  display_name: 'Jan',
  role: 'owner' as const,
};

const mockAuthState = {
  user: mockUser as typeof mockUser | null,
  clearAuth: mockClearAuth,
};

jest.mock('../stores/authStore', () => ({
  useAuthStore: jest.fn((sel: any) => sel(mockAuthState)),
}));

import { useAuthStore } from '../stores/authStore';
import SettingsScreen from '../app/(app)/settings';

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthState.user = mockUser;
  (useAuthStore as unknown as jest.Mock).mockImplementation((sel: any) => sel(mockAuthState));
});

test('SettingsScreen renders user info', () => {
  const { getByTestId } = render(<SettingsScreen />);
  expect(getByTestId('display-name').props.children).toBe('Jan');
  expect(getByTestId('email').props.children).toBe('jan@toenhardt.de');
  expect(getByTestId('role').props.children).toBe('owner');
});

test('SettingsScreen shows "–" when user is null', () => {
  mockAuthState.user = null;
  (useAuthStore as unknown as jest.Mock).mockImplementation((sel: any) => sel(mockAuthState));
  const { getByTestId } = render(<SettingsScreen />);
  expect(getByTestId('display-name').props.children).toBe('–');
});

test('SettingsScreen calls clearAuth when logout confirmed', async () => {
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
    // Find and press the destructive button
    const destructiveBtn = buttons?.find((b: any) => b.style === 'destructive');
    destructiveBtn?.onPress?.();
  });

  const { getByTestId } = render(<SettingsScreen />);
  fireEvent.press(getByTestId('logout-btn'));

  await waitFor(() => expect(mockClearAuth).toHaveBeenCalled());
  alertSpy.mockRestore();
});
