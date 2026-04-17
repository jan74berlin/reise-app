import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import { ApiError } from '../api/client';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
}));
jest.mock('../api/auth');

const mockSetAuth = jest.fn();
jest.mock('../stores/authStore', () => ({
  useAuthStore: () => ({ setAuth: mockSetAuth }),
}));

import { login } from '../api/auth';
import LoginScreen from '../app/(auth)/login';
import RegisterScreen from '../app/(auth)/register';

const mockPush = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  (useRouter as jest.Mock).mockReturnValue({ push: mockPush });
});

// Test 1: Login screen renders email and password inputs
test('Login screen renders email and password inputs', () => {
  const { getByTestId } = render(<LoginScreen />);
  expect(getByTestId('email-input')).toBeTruthy();
  expect(getByTestId('password-input')).toBeTruthy();
});

// Test 2: Login screen calls login() and setAuth() on submit with valid credentials
test('Login screen calls login() and setAuth() on submit with valid credentials', async () => {
  const fakeToken = 'tok-abc';
  const fakeUser = { id: '1', email: 'a@b.com', display_name: 'A', role: 'owner' as const };
  (login as jest.Mock).mockResolvedValue({ token: fakeToken, user: fakeUser });

  const { getByTestId } = render(<LoginScreen />);

  fireEvent.changeText(getByTestId('email-input'), 'a@b.com');
  fireEvent.changeText(getByTestId('password-input'), 'secret');
  fireEvent.press(getByTestId('submit-button'));

  await waitFor(() => {
    expect(login).toHaveBeenCalledWith('a@b.com', 'secret');
  });
  await waitFor(() => {
    expect(mockSetAuth).toHaveBeenCalledWith(fakeToken, fakeUser);
  });
});

// Test 3: Login screen shows error message on ApiError
test('Login screen shows error message on ApiError', async () => {
  (login as jest.Mock).mockRejectedValue(new ApiError(401, 'Ungültige Anmeldedaten'));

  const { getByTestId, getByText } = render(<LoginScreen />);

  fireEvent.changeText(getByTestId('email-input'), 'bad@b.com');
  fireEvent.changeText(getByTestId('password-input'), 'wrong');
  fireEvent.press(getByTestId('submit-button'));

  await waitFor(() => {
    expect(getByText('Ungültige Anmeldedaten')).toBeTruthy();
  });
});

// Test 4: Register screen renders all 4 fields
test('Register screen renders all 4 fields', () => {
  const { getByTestId } = render(<RegisterScreen />);
  expect(getByTestId('email-input')).toBeTruthy();
  expect(getByTestId('password-input')).toBeTruthy();
  expect(getByTestId('display-name-input')).toBeTruthy();
  expect(getByTestId('family-name-input')).toBeTruthy();
});
