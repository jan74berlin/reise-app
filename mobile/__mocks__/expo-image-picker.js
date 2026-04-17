module.exports = {
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  launchImageLibraryAsync: jest.fn().mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///test/photo.jpg', mimeType: 'image/jpeg' }],
  }),
  MediaTypeOptions: { Images: 'Images', Videos: 'Videos', All: 'All' },
};
