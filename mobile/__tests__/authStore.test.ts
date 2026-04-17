import { useAuthStore } from '../stores/authStore';

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
  getItemAsync: jest.fn().mockResolvedValue(null),
}));

const mockUser = { id: '1', email: 'a@b.de', display_name: 'A', role: 'owner' as const };

beforeEach(() => {
  useAuthStore.setState({ token: null, user: null, hydrated: false });
});

test('setAuth stores token and user', async () => {
  await useAuthStore.getState().setAuth('tok123', mockUser);
  expect(useAuthStore.getState().token).toBe('tok123');
  expect(useAuthStore.getState().user).toEqual(mockUser);
});

test('clearAuth removes token and user', async () => {
  await useAuthStore.getState().setAuth('tok123', mockUser);
  await useAuthStore.getState().clearAuth();
  expect(useAuthStore.getState().token).toBeNull();
  expect(useAuthStore.getState().user).toBeNull();
});

test('hydrate reads from SecureStore', async () => {
  const SecureStore = require('expo-secure-store');
  SecureStore.getItemAsync
    .mockResolvedValueOnce('hydrated-token')
    .mockResolvedValueOnce(JSON.stringify(mockUser));
  await useAuthStore.getState().hydrate();
  expect(useAuthStore.getState().token).toBe('hydrated-token');
  expect(useAuthStore.getState().user).toEqual(mockUser);
  expect(useAuthStore.getState().hydrated).toBe(true);
});
