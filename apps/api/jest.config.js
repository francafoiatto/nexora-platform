module.exports = {
  roots: ['<rootDir>/src'],
  testRegex: '.*\\.spec\\.ts$',
  transform: {'^.+\\.ts$': ['ts-jest', {tsconfig: 'tsconfig.json'}]},
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'json']
};
