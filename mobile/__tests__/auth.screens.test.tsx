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
  useAuthStore: jest.fn(() => ({ setAuth: mockSetAuth })),
}));
import { useAuthStore } from '../stores/authStore';

import { login, register, join } from '../api/auth';
import LoginScreen from '../app/(auth)/login';
import RegisterScreen from '../app/(auth)/register';
import JoinScreen from '../app/(auth)/join';

const mockPush = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  (useRouter as jest.Mock).mockReturnValue({ push: mockPush });
  (useAuthStore as jest.Mock).mockReturnValue({ setAuth: mockSetAuth });
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

// --- Register tests ---
test('Register screen calls register() and setAuth() on submit', async () => {
  const mockRegister = register as jest.Mock;
  const mockSetAuthFn = jest.fn();
  (useAuthStore as jest.Mock).mockReturnValue({ setAuth: mockSetAuthFn });
  mockRegister.mockResolvedValue({ token: 'tok2', user: { email: 'new@example.com' }, family: {} });

  const { getByTestId } = render(<RegisterScreen />);
  fireEvent.changeText(getByTestId('email-input'), 'new@example.com');
  fireEvent.changeText(getByTestId('password-input'), 'pass');
  fireEvent.changeText(getByTestId('display-name-input'), 'New User');
  fireEvent.changeText(getByTestId('family-name-input'), 'My Family');
  fireEvent.press(getByTestId('submit-button'));

  await waitFor(() => {
    expect(mockRegister).toHaveBeenCalledWith('new@example.com', 'pass', 'New User', 'My Family');
    expect(mockSetAuthFn).toHaveBeenCalledWith('tok2', expect.objectContaining({ email: 'new@example.com' }));
  });
});

test('Register screen shows error on ApiError', async () => {
  const mockRegister = register as jest.Mock;
  mockRegister.mockRejectedValue(new ApiError(400, 'Email already in use'));

  const { getByTestId, findByText } = render(<RegisterScreen />);
  fireEvent.changeText(getByTestId('email-input'), 'dup@example.com');
  fireEvent.press(getByTestId('submit-button'));

  await findByText('Email already in use');
});

// --- Join tests ---
test('Join screen renders invite_code, email, password, display_name inputs', () => {
  const { getByTestId } = render(<JoinScreen />);
  expect(getByTestId('invite-code-input')).toBeTruthy();
  expect(getByTestId('email-input')).toBeTruthy();
  expect(getByTestId('password-input')).toBeTruthy();
  expect(getByTestId('display-name-input')).toBeTruthy();
});

test('Join screen calls join() and setAuth() on submit', async () => {
  const mockJoin = join as jest.Mock;
  const mockSetAuthFn = jest.fn();
  (useAuthStore as jest.Mock).mockReturnValue({ setAuth: mockSetAuthFn });
  mockJoin.mockResolvedValue({ token: 'tok3', user: { email: 'j@example.com' }, family: {} });

  const { getByTestId } = render(<JoinScreen />);
  fireEvent.changeText(getByTestId('invite-code-input'), 'CODE123');
  fireEvent.changeText(getByTestId('email-input'), 'j@example.com');
  fireEvent.changeText(getByTestId('password-input'), 'pw');
  fireEvent.changeText(getByTestId('display-name-input'), 'Joiner');
  fireEvent.press(getByTestId('submit-button'));

  await waitFor(() => {
    expect(mockJoin).toHaveBeenCalledWith('CODE123', 'j@example.com', 'pw', 'Joiner');
    expect(mockSetAuthFn).toHaveBeenCalledWith('tok3', expect.objectContaining({ email: 'j@example.com' }));
  });
});
