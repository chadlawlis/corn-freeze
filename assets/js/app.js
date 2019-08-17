/* global mapboxgl */
/* global $ */

import { Spinner } from './spin.js';

var opts = {
  lines: 13, // The number of lines to draw
  length: 38, // The length of each line
  width: 17, // The line thickness
  radius: 45, // The radius of the inner circle
  scale: 0.6, // Scales overall size of the spinner
  corners: 1, // Corner roundness (0..1)
  color: '#ccc', // CSS color or array of colors
  fadeColor: 'transparent', // CSS color or array of colors
  speed: 1, // Rounds per second
  rotate: 0, // The rotation offset
  animation: 'spinner-line-fade-quick', // The CSS animation name for the lines
  direction: 1, // 1: clockwise, -1: counterclockwise
  zIndex: 2e9, // The z-index (defaults to 2000000000)
  className: 'spinner', // The CSS class to assign to the spinner
  top: '50%', // Top position relative to parent
  left: '50%', // Left position relative to parent
  shadow: '0 0 1px transparent', // Box-shadow for the lines
  position: 'absolute' // Element positioning
};

var target = document.getElementById('loading');
var spinner = new Spinner(opts);

var layers;
var firstLandUseId;

// Declare freeze layers for radio buttons
// See fLayers.forEach() in map.onLoad() for menu creation
var fLayers = [10, 20, 50, 80];

// CARTO user, query parameters, query
var user = 'data-inno';
var fLayer = fLayers[0];
var fDoy;
var fDate;
var sDoy;
var sDate;
var sql;

// value < breakpoint falls into each step, value >= last breakpoint creates final step:
// value < 239
// 239 <= value < 271
// 271 <= value < 286
// 286 <= value < 298
// 298 <= value < 308
// 308 <= value < 321
// 335 <= value < 335
// 335 <= value
var breakpoints = [239, 271, 286, 298, 308, 321, 335];
var fillColors = ['#5c53a5', '#a059a0', '#ce6693', '#eb7f86', '#f8a07e', '#fac484', '#f3e79b', '#dfdfdf'];

mapboxgl.accessToken = 'pk.eyJ1IjoiaW5kaWdvYWctaXQiLCJhIjoiY2pydWxiMjRsMDl4MjQ0bDUxcjdkb2FxaCJ9.Jt2VXR5rX8dJSYq9yio5Hw';

var map = new mapboxgl.Map({
  container: 'map',
  hash: true,
  style: 'mapbox://styles/mapbox/light-v10',
  customAttribution: '<a href="https://chadlawlis.com">Chad Lawlis</a>'
});

var usBounds = [[-131.497070, 22.093303], [-62.502929, 52.661410]];
map.fitBounds(usBounds);

// Create popup, but don't add it to the map yet
var popup = new mapboxgl.Popup({
  closeButton: false,
  closeOnClick: false
});

map.on('load', function () {
  // Add zoom and rotation controls
  map.addControl(new mapboxgl.NavigationControl({ showCompass: false }));

  // Add fullscreen control
  map.addControl(new mapboxgl.FullscreenControl());

  // Create custom "zoom to US" control class
  // https://docs.mapbox.com/mapbox-gl-js/api/#icontrol
  class ZoomUsControl {
    onAdd (map) {
      this._map = map;
      this._container = document.createElement('div');
      this._container.id = 'usa-control';
      this._container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group usa-control';
      this._container.appendChild(document.createElement('button'));
      return this._container;
    }
    onRemove () {
      this._container.parentNode.removeChild(this._container);
      this._map = undefined;
    }
  }

  // Add custom "zoom to US" control to map
  var zoomUsControl = new ZoomUsControl();
  map.addControl(zoomUsControl);

  // Customize "zoom to US" control to display custom icon and fitBounds functionality
  // using same usBounds bounding box from page landing extent above
  var usaControl = document.getElementById('usa-control');
  var usaButton = usaControl.firstElementChild;
  usaButton.id = 'usa';
  usaButton.title = 'Zoom to US';
  usaButton.innerHTML = '<img width="20" height="20" src="assets/img/usa.svg">';
  usaButton.addEventListener('click', function () {
    map.fitBounds(usBounds, {
      linear: true
    });
  });

  layers = map.getStyle().layers;

  // Find the index of the first landuse layer in the loaded map style
  for (let i = 0; i < layers.length; i++) {
    // If needed, can use regex to identify layer with id starting with "landuse" (https://stackoverflow.com/a/1315236)
    // layers[i].id.match(/landuse.*/)
    if (layers[i].id === 'settlement-label') {
      firstLandUseId = layers[i].id;
      break;
    }
  }

  var overlays = document.getElementById('overlays');
  overlays.className = 'map-overlay bottom-left';

  var layersMenu = document.createElement('div');
  layersMenu.id = 'layers-menu';
  layersMenu.className = 'layers-menu';
  overlays.appendChild(layersMenu);

  fLayers.forEach(function (l) { // Instantiate layersMenu with an input for each freeze layer
    var layerDiv = document.createElement('div'); // Store each input in a div for vertical list display
    layerDiv.id = 'freeze-' + l;
    var layerInput = document.createElement('input');
    layerInput.id = layerDiv.id + '-input';
    layerInput.type = 'radio';
    layerInput.name = 'rtoggle';
    layerInput.value = l;
    if (l === 10) { // Set 10% freeze to checked by default (given loaded on landing)
      layerInput.checked = true;
    }
    layerDiv.appendChild(layerInput);

    var layerLabel = document.createElement('label');
    layerLabel.textContent = l + '% Freeze';
    layerDiv.appendChild(layerLabel);

    layersMenu.appendChild(layerDiv);
  });

  // Add map style switcher functionality
  var inputs = layersMenu.getElementsByTagName('input');

  function switchLayer (layer) {
    fLayer = layer.target.value;

    if (map.getLayer('counties')) {
      map.removeLayer('counties');
    }

    if (map.getSource('counties')) {
      map.removeSource('counties');
    }

    setAttributes();
  }

  for (let i = 0; i < inputs.length; i++) {
    inputs[i].onclick = switchLayer;
  }

  setAttributes();
});

function setAttributes () {
  fDoy = 'f_' + fLayer + '_doy';
  fDate = 'f_' + fLayer + '_date';
  sDoy = 's_' + fLayer + '_doy';
  sDate = 's_' + fLayer + '_date';

  setQuery();
}

function setQuery () {
  sql = 'select geoid, name || \' County\' as name, state_name, ' + fDoy + ', ' + fDate + ', ' + sDoy + ', ' + sDate + ', the_geom from counties_48 where ' + fDoy + ' is not null';

  loadData();
}

function loadData () {
  $.ajax('https://' + user + '.carto.com/api/v2/sql?format=GeoJSON&q=' + sql, {
    beforeSend: function () {
      spinner.spin(target);
    },
    complete: function () {
      spinner.stop();
    },
    dataType: 'json',
    success: function (response) {
      mapData(response);
    },
    error: function () {
      spinner.stop();
    },
    statusCode: {
      400: function () {
        window.alert('Error (400): Bad request.');
      },
      404: function () {
        window.alert('Error (404): The requested resource could not be found.');
      },
      500: function () {
        window.alert('Error (500): Internal server error.');
      }
    }
  });
}

function mapData (data) {
  map.addSource('counties', {
    'type': 'geojson',
    'data': data
  });

  map.addLayer({
    'id': 'counties',
    'type': 'fill',
    'source': 'counties',
    'paint': {
      'fill-color': [
        'step',
        ['get', fDoy],
        fillColors[0],
        breakpoints[0], fillColors[1],
        breakpoints[1], fillColors[2],
        breakpoints[2], fillColors[3],
        breakpoints[3], fillColors[4],
        breakpoints[4], fillColors[5],
        breakpoints[5], fillColors[6],
        breakpoints[6], fillColors[7]
      ],
      'fill-opacity': 1,
      'fill-outline-color': '#fff'
    }
  }, firstLandUseId);

  layers = map.getStyle().layers;
  console.log(layers);

  // Add popup for each layer
  // Change cursor to pointer on parcel layer mouseover
  map.on('mousemove', 'counties', function (e) {
    map.getCanvas().style.cursor = 'pointer';

    var popupContent;
    var props = e.features[0].properties;

    if (props[sDate] !== 'null') {
      popupContent = '<p><b>' + props.name + '</b></p>' +
      '<p>' + props.state_name + '</p><hr>' +
      '<p><b>Freeze date:</b></p><p>' + props[fDate] + '</p>' +
      '<p><b>Latest silking date:</b></p><p>' + props[sDate] + '</p>';
    } else {
      popupContent = '<p><b>' + props.name + '</b></p>' +
      '<p>' + props.state_name + '</p><hr>' +
      '<p><b>Freeze date:</b></p><p>' + props[fDate] + '</p>' +
      '<p><b>Latest silking date:</b></p><p>N/A</p>';
    }
    popup.setLngLat(e.lngLat)
      .setHTML(popupContent)
      .addTo(map);
  });

  // Change cursor back to default ("grab") on parcel layer mouseleave
  map.on('mouseleave', 'counties', function () {
    map.getCanvas().style.cursor = '';
    popup.remove();
  });
}
