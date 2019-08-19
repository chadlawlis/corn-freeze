/* global mapboxgl */
/* global $ */

import { Spinner } from './spin.js';

(function () {
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

  var mapLayers;
  var firstLandUseId;
  var visibility = 'visible';

  // Declare freeze layer values for radio buttons
  var fLayers = ['10', '20', '50', '80'];

  // CARTO user, query attributes/values, query
  var user = 'data-inno';
  var fLayer = fLayers[0]; // freeze layer; set to 10 freeze layer on page landing
  var fDoy; // freeze day of year attribute
  var fDate; // freeze date attribute
  var sDoy; // silk doy of year attribute
  var sDate; // silk date attribute
  var sDateFilter; // silk date attribute value for filter
  var sql; // sql query

  var data;

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

  mapboxgl.accessToken = 'pk.eyJ1IjoiY2hhZGxhd2xpcyIsImEiOiJlaERjUmxzIn0.P6X84vnEfttg0TZ7RihW1g';

  var map = new mapboxgl.Map({
    container: 'map',
    hash: true,
    style: 'mapbox://styles/mapbox/light-v10', // mapbox://styles/mapbox/satellite-streets-v11
    customAttribution: '<a href="https://chadlawlis.com">Chad Lawlis</a>'
  });

  var usBounds = [[-131.497070, 22.093303], [-62.502929, 52.661410]];
  map.fitBounds(usBounds);

  // Declare baseLayers for map style switcher
  // See baseLayers.forEach() in map.onLoad() for menu creation
  var baseLayers = [{
    label: 'Light',
    id: 'light-v10'
  }, {
    label: 'Satellite',
    id: 'satellite-streets-v11'
  }];

  // Create popup, but don't add it to the map yet
  var popup = new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: false
  });

  // Trigger mapData() on map style load (ensures data persists when map style changed)
  map.on('style.load', function () {
    if (data) {
      mapData(data);
    }
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

    // Create map style switcher structure
    var layersToggle = document.getElementById('layers-toggle'); // Create "layers-toggle" parent div
    layersToggle.className = 'layers-toggle map-overlay';

    var layersImage = document.createElement('div'); // Create "layers-image" div with Leaflet layers icon; default display
    layersImage.id = 'layers-image';
    layersImage.className = 'layers-image';
    var layersImageAnchor = document.createElement('a');
    var layersImageIcon = document.createElement('img');
    layersImageIcon.src = 'assets/img/layers.png';
    layersImageIcon.className = 'layers-icon';
    layersImageIcon.alt = 'layers icon';
    layersImageAnchor.appendChild(layersImageIcon);
    layersImage.appendChild(layersImageAnchor);
    layersToggle.appendChild(layersImage);

    var layersMenu = document.createElement('div'); // Create "layers-menu" div; displays on mouseover
    layersMenu.id = 'layers-menu';
    layersMenu.className = 'layers-menu';

    var overlayLayersMenu = document.createElement('div');
    overlayLayersMenu.id = 'overlay-layers-menu';
    overlayLayersMenu.className = 'form-menu';

    var overlayToggle = document.createElement('div');
    overlayToggle.className = 'overlay-layer-checkbox toggle';
    var overlayToggleInput = document.createElement('input');
    overlayToggleInput.type = 'checkbox';
    overlayToggleInput.id = 'overlay-layer-checkbox-input';
    overlayToggleInput.checked = true;
    var overlayToggleLabel = document.createElement('label');
    overlayToggleLabel.textContent = 'Counties';
    overlayToggle.appendChild(overlayToggleInput);
    overlayToggle.appendChild(overlayToggleLabel);
    overlayLayersMenu.appendChild(overlayToggle);

    overlayToggleInput.addEventListener('change', function (e) {
      map.setLayoutProperty('counties', 'visibility', e.target.checked ? 'visible' : 'none');
      visibility = map.getLayoutProperty('counties', 'visibility');
      // parcelVisibility
    });

    layersMenu.appendChild(overlayLayersMenu);

    var baseLayersMenu = document.createElement('div');
    baseLayersMenu.id = 'base-layers-menu';
    baseLayersMenu.className = 'form-menu';

    baseLayers.forEach(function (l) { // Instantiate layersMenu with an input for each baseLayer declared at top of script
      var layerDiv = document.createElement('div'); // Store each input in a div for vertical list display
      layerDiv.id = l.label.toLowerCase() + '-input';
      layerDiv.className = 'toggle';
      var layerInput = document.createElement('input');
      layerInput.id = l.id;
      layerInput.type = 'radio';
      layerInput.name = 'base-layer';
      layerInput.value = l.label.toLowerCase();
      if (l.label === 'Light') { // Set Light style to checked by default (given loaded on landing)
        layerInput.checked = true;
      }
      layerDiv.appendChild(layerInput);

      var layerLabel = document.createElement('label');
      layerLabel.for = l.label.toLowerCase();
      layerLabel.textContent = l.label;
      layerDiv.appendChild(layerLabel);

      baseLayersMenu.appendChild(layerDiv);
    });

    layersMenu.appendChild(baseLayersMenu);
    layersToggle.appendChild(layersMenu);

    // Add map style switcher functionality
    var baseLayerInputs = baseLayersMenu.getElementsByTagName('input');

    function switchBaseLayer (layer) {
      var layerId = layer.target.id;
      map.setStyle('mapbox://styles/mapbox/' + layerId);
      // setStyle also triggers map.on('style.load') above, which includes a renewed call to mapData()
    }

    for (let i = 0; i < baseLayerInputs.length; i++) {
      baseLayerInputs[i].onclick = switchBaseLayer;
    }

    layersToggle.addEventListener('mouseover', function (e) {
      layersMenu.style.display = 'block'; // Display layer switcher menu on hover ..
      layersImage.style.display = 'none'; // ... replacing layers icon
    });

    layersToggle.addEventListener('mouseout', function (e) {
      layersImage.style.display = 'block'; // Return to default display of layers icon on mouseout ...
      layersMenu.style.display = 'none'; // ... hiding layer switcher menu
    });

    var overlays = document.getElementById('form');
    overlays.className = 'map-overlay bottom-left';

    var fLayersToggle = document.createElement('div');
    fLayersToggle.id = 'f-layers-toggle';
    fLayersToggle.className = 'form-menu';

    var fLayersToggleLabelDiv = document.createElement('div');
    fLayersToggleLabelDiv.id = 'f-layers-toggle-label';
    fLayersToggleLabelDiv.className = 'form-label';

    var fLayersToggleLabel = document.createElement('label');
    fLayersToggleLabel.innerHTML = '<b>Earliest hard freeze</b> <span class="small">(28&#176;F) <i class="fas fa-question-circle"></i></span>';
    fLayersToggleLabelDiv.appendChild(fLayersToggleLabel);
    fLayersToggle.appendChild(fLayersToggleLabelDiv);

    var gradientLabel = document.createElement('div');
    gradientLabel.id = 'legend-gradient-label';
    gradientLabel.className = 'legend-gradient-label small';
    gradientLabel.innerHTML = 'June 1<span style="float: right;">November 30</span>';
    fLayersToggle.appendChild(gradientLabel);

    var gradient = document.createElement('div');
    gradient.id = 'legend-gradient';
    gradient.className = 'legend-gradient';
    fLayersToggle.appendChild(gradient);

    var legendBlock = document.createElement('div');
    legendBlock.id = 'legend-block';
    legendBlock.className = 'legend-block small';
    legendBlock.innerHTML = '<i style="background: #dfdfdf"></i>on/after December 1';
    fLayersToggle.appendChild(legendBlock);

    // Instantiate fLayersToggle with an input for each freeze layer
    fLayers.forEach(function (l) {
      // Store each input in a div for vertical list display
      var layerDiv = document.createElement('div');
      layerDiv.id = 'f-layer-' + l;
      layerDiv.className = 'toggle';
      var layerInput = document.createElement('input');
      layerInput.id = layerDiv.id + '-input';
      layerInput.type = 'radio';
      layerInput.name = 'freeze-layer';
      layerInput.value = l;
      // Set 10 freeze layer to checked by default (given loaded on landing)
      if (l === '10') {
        layerInput.checked = true;
      }
      layerDiv.appendChild(layerInput);

      var layerLabel = document.createElement('label');
      layerLabel.textContent = l.substring(0, 1) + ' of past 10 years';
      layerDiv.appendChild(layerLabel);

      fLayersToggle.appendChild(layerDiv);
    });

    overlays.appendChild(fLayersToggle);

    // Add map style switcher functionality
    var fLayerInputs = fLayersToggle.getElementsByTagName('input');

    function switchFreezeLayer (layer) {
      fLayer = layer.target.value;
      setAttributes();
    }

    for (let i = 0; i < fLayerInputs.length; i++) {
      fLayerInputs[i].onclick = switchFreezeLayer;
    }

    var dateForm = document.createElement('form');
    dateForm.id = 'date-form';
    dateForm.className = 'form-menu';

    var datePickerLabelDiv = document.createElement('div');
    datePickerLabelDiv.id = 'date-picker-label';
    datePickerLabelDiv.className = 'form-label';

    var datePickerLabel = document.createElement('label');
    datePickerLabel.innerHTML = '<b style="vertical-align: middle;">Latest silking date</b> <span class="small" style="vertical-align: middle;">(on/before) <i class="fas fa-question-circle"></i></span>';
    datePickerLabelDiv.appendChild(datePickerLabel);

    var datePickerInputDiv = document.createElement('div');
    datePickerInputDiv.id = 'date-picker-input';
    datePickerInputDiv.className = 'date-picker-input';

    var datePickerInput = document.createElement('input');
    datePickerInput.id = 'date-input';
    datePickerInput.type = 'date';
    datePickerInput.name = 'silk-date';
    datePickerInput.value = '';
    datePickerInput.min = '2019-06-01';
    datePickerInput.max = '2019-10-31';

    datePickerInput.addEventListener('change', function () {
      if (datePickerInput.value.length === 10) {
        datePickerButton.disabled = false;
        datePickerResetButton.disabled = false;
      } else {
        if (sDateFilter && sql.indexOf(sDateFilter) > -1) {
          if (map.getLayer('counties')) {
            map.removeLayer('counties');
          }
          if (map.getSource('counties')) {
            map.removeSource('counties');
          }

          sDateFilter = '';
          setQuery();
        }
        datePickerButton.disabled = true;
        datePickerResetButton.disabled = true;
      }
    });

    datePickerInputDiv.appendChild(datePickerInput);

    var datePickerButtonDiv = document.createElement('div');
    datePickerButtonDiv.id = 'date-picker-button';
    datePickerButtonDiv.className = 'date-picker-button';

    var datePickerButton = document.createElement('button');
    datePickerButton.id = 'date-button';
    datePickerButton.className = 'date-button';
    datePickerButton.type = 'button';
    datePickerButton.disabled = true;
    datePickerButton.textContent = 'Submit';

    datePickerButton.addEventListener('click', function () {
      if (datePickerInput.value.length === 10) {
        sDateFilter = '\'' + datePickerInput.value + '\'';

        if (map.getLayer('counties')) {
          map.removeLayer('counties');
        }
        if (map.getSource('counties')) {
          map.removeSource('counties');
        }

        setQuery();
      }
    });

    var datePickerResetButton = document.createElement('button');
    datePickerResetButton.id = 'date-reset-button';
    datePickerResetButton.className = 'date-button reset';
    datePickerResetButton.type = 'button';
    datePickerResetButton.disabled = true;
    datePickerResetButton.textContent = 'Reset';

    datePickerResetButton.addEventListener('click', function () {
      if (datePickerInput.value.length === 10) {
        if (sDateFilter && sql.indexOf(sDateFilter) > -1) {
          datePickerInput.value = '';
          sDateFilter = '';

          if (map.getLayer('counties')) {
            map.removeLayer('counties');
          }
          if (map.getSource('counties')) {
            map.removeSource('counties');
          }

          setQuery();
        } else {
          datePickerInput.value = '';
          sDateFilter = '';
        }
        datePickerResetButton.disabled = true;
        datePickerButton.disabled = true;
      }
    });

    datePickerButtonDiv.appendChild(datePickerButton);
    datePickerButtonDiv.appendChild(datePickerResetButton);

    dateForm.appendChild(datePickerLabelDiv);
    dateForm.appendChild(datePickerInputDiv);
    dateForm.appendChild(datePickerButtonDiv);
    overlays.appendChild(dateForm);

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
    if (sDateFilter) {
      sql = 'select geoid, name || \' County\' as name, state_name, ' + fDoy + ', ' + fDate + ', ' + sDoy + ', ' + sDate + ', the_geom from counties_48 where ' + fDoy + ' is not null and ' + sDate + ' <= ' + sDateFilter;
    } else {
      sql = 'select geoid, name || \' County\' as name, state_name, ' + fDoy + ', ' + fDate + ', ' + sDoy + ', ' + sDate + ', the_geom from counties_48 where ' + fDoy + ' is not null';
    }

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
        data = response;
        mapData(data);
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
    if (map.getLayer('counties')) {
      map.removeLayer('counties');
    }
    if (map.getSource('counties')) {
      map.removeSource('counties');
    }

    mapLayers = map.getStyle().layers;

    // Find the index of the settlement-label layer in the loaded map style, to place counties layer below
    for (let i = 0; i < mapLayers.length; i++) {
      if (mapLayers[i].id === 'settlement-label') {
        firstLandUseId = mapLayers[i].id;
        break;
      }
    }

    map.addSource('counties', {
      'type': 'geojson',
      'data': data
    });

    map.addLayer({
      'id': 'counties',
      'type': 'fill',
      'source': 'counties',
      'layout': {
        'visibility': visibility
      },
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

    // Add popup for each layer
    // Change cursor to pointer on parcel layer mouseover
    map.on('mousemove', 'counties', function (e) {
      map.getCanvas().style.cursor = 'pointer';

      var popupContent;
      var props = e.features[0].properties;

      popupContent = '<div><div class="popup-menu"><p><b>' + props.name + '</b></p>' +
      '<p style="margin-top: 2px">' + props.state_name + '</p></div>' +
      '<hr>' +
      '<div class="popup-menu"><p><b>Hard Freeze Date</b></p>' +
      '<p class="small" style="margin-top: 2px">' + fLayer.substring(0, 1) + ' of past 10 years</p><p>' +
      props[fDate] + '</p>' +
      '<p><b>Latest Silking Date</b></p><p>';

      if (props[sDate] !== 'null') {
        popupContent += props[sDate] + '</p></div></div>';
      } else {
        popupContent += 'N/A</p></div></div>';
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
})();
