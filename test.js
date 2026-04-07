const d3 = require('d3');
const s = d3.scaleSequential().domain([0, 0]).interpolator(d3.interpolateRgbBasis(['red', 'blue']));
console.log(s(0));
