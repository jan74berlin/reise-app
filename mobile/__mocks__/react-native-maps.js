const React = require('react');

const MockMapView = ({ children, ...props }) =>
  React.createElement('MapView', props, children);

const MockMarker = (props) => React.createElement('Marker', props);
const MockCircle = (props) => React.createElement('Circle', props);

MockMapView.Marker = MockMarker;
MockMapView.Circle = MockCircle;

module.exports = {
  __esModule: true,
  default: MockMapView,
  Marker: MockMarker,
  Circle: MockCircle,
  PROVIDER_GOOGLE: 'google',
};
