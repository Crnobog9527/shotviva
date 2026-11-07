// Particle colours, the same values as the tokens in globals.css (canvas cannot read CSS
// variables cheaply per frame): bone, safelight, graphite paper; the Pro sapphires; the Max
// gold foil stops (the --chrome gradient).
export const C = {
  bone: '#F2ECE3',
  boneDim: 'rgba(242,236,227,.7)',
  safe: '#FF5B2E',
  safeHi: '#FFB08F',
  safeMid: '#FF8A5C',
  graphite: '#3A332D',
  sapInk: '#A9C2FF',
  sapFlag: '#5B86FF',
  sapRim: '#7EA0FF',
  white: '#FFFFFF',
  gold: ['#F2CF7A', '#FFE9B0', '#E2B65A', '#B8862E', '#FFF1C9', '#F7DF9A'],
} as const
