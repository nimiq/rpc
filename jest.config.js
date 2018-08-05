module.exports = {
  moduleFileExtensions: [
    'ts',
    'js',
    'json'
  ],
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },
  testMatch: [
    // '**/tests/**/*.spec.(js|ts)|**/__tests__/*.(js|ts)'
      '**/tests/**/*.spec.(ts)|**/__tests__/*.(ts)'
  ],
  testURL: 'http://localhost/'
};
