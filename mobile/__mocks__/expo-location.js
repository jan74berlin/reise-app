module.exports = {
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getCurrentPositionAsync: jest.fn().mockResolvedValue({
    coords: { latitude: 54.1234, longitude: 25.5678 },
  }),
  Accuracy: { Balanced: 3 },
};
