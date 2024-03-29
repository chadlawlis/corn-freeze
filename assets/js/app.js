/* global $, mapboxgl */

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
  var firstLabelLayer;
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
  // first breakpoints value (1) and fillColors value (#f1f1f0) included for counties with NULL freeze dates
  // null values converted to 0 via 'to-number' expression ['to-number', ['get', fDoy]] in 'fill-color' property of addLayer
  // https://docs.mapbox.com/mapbox-gl-js/style-spec/#expressions-types-to-number
  // value < 1
  // 1 <= value < 239
  // 239 <= value < 271
  // 271 <= value < 286
  // 286 <= value < 298
  // 298 <= value < 308
  // 308 <= value < 321
  // 335 <= value < 335
  // 335 <= value
  var breakpoints = [1, 239, 271, 286, 298, 308, 321, 335];
  var fillColors = ['#f1f1f0', '#5c53a5', '#a059a0', '#ce6693', '#eb7f86', '#f8a07e', '#fac484', '#f3e79b', '#dfdfdf'];

  mapboxgl.accessToken = 'pk.eyJ1IjoiY2hhZGxhd2xpcyIsImEiOiJlaERjUmxzIn0.P6X84vnEfttg0TZ7RihW1g';

  var map = new mapboxgl.Map({
    container: 'map',
    hash: true,
    style: 'mapbox://styles/mapbox/light-v10',
    customAttribution: '<a href="https://chadlawlis.com">Chad Lawlis</a>'
  });

  // [[sw],[ne]]
  // var usBounds = [[-131.5, 22.1], [-62.5, 52.6]];
  // moved the view slightly west (i.e., moved US slightly east on the map) to accommodate form-menu on 13" laptop
  var usBounds = [[-135.5, 22.1], [-66.5, 52.6]];
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
    mapLayers = map.getStyle().layers;

    // Find the index of the settlement-label layer in the loaded map style, to place counties layer below
    for (let i = 0; i < mapLayers.length; i++) {
      if (mapLayers[i].id === 'settlement-label') {
        firstLabelLayer = mapLayers[i].id;
        break;
      }
    }

    if (data) {
      mapData(data);
    }
  });

  map.on('load', function () {
    // Add zoom and rotation controls
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }));

    // Add fullscreen control
    // map.addControl(new mapboxgl.FullscreenControl());

    // Create custom "zoom to US" control and implement as ES6 class
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
    layersImage.appendChild(layersImageAnchor);
    layersToggle.appendChild(layersImage);

    var layersMenu = document.createElement('div'); // Create "layers-menu" div; displays on mouseover
    layersMenu.id = 'layers-menu';
    layersMenu.className = 'layers-menu';

    var overlayLayersMenu = document.createElement('div');
    overlayLayersMenu.id = 'overlay-layers-menu';
    overlayLayersMenu.className = 'layers-form-menu';

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
      map.setLayoutProperty('counties-line', 'visibility', e.target.checked ? 'visible' : 'none');
      visibility = map.getLayoutProperty('counties', 'visibility');
    });

    layersMenu.appendChild(overlayLayersMenu);

    var baseLayersMenu = document.createElement('div');
    baseLayersMenu.id = 'base-layers-menu';
    baseLayersMenu.className = 'layers-form-menu';

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
      // Only set style if different than current style
      if (map.getStyle().metadata['mapbox:origin'] !== layerId) {
        map.setStyle('mapbox://styles/mapbox/' + layerId);
        // setStyle also triggers map.on('style.load') above, which includes a renewed call to mapData()
      }
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

    // Create lightbox for "about" modal
    // https://developer.mozilla.org/en-US/docs/Web/CSS/:target
    var lightbox = document.getElementById('lightbox');
    var infoLightBox = document.createElement('div');
    infoLightBox.id = 'about';
    infoLightBox.className = 'lightbox';
    var infoLightBoxFigure = document.createElement('figure');
    var infoLightBoxFigureAnchor = document.createElement('a');
    infoLightBoxFigureAnchor.href = '#';
    infoLightBoxFigureAnchor.className = 'close';
    var infoLightBoxFigureCaption = document.createElement('figcaption');
    infoLightBoxFigureCaption.innerHTML = '<h1>About</h1>' +
    '<p>The late start to this year\'s corn growing season, delayed from early-season flooding and cool temperatures across the Midwest, means growers are at risk of losing significant portions of their harvest in the event of an early freeze.</p>' +
    '<p>This map provides a national picture of the earliest freeze dates by county over the past ten years (2009-2018), and the date by which corn must "silk" in order to reach maturation ahead of the freeze.</p>' +
    '<p>Created by <a href="https://chadlawlis.com" target="_blank">Chad Lawlis</a>.</p>' +
    '<h1>Data</h1>' +
    '<p><b>Earliest hard freeze</b> is the earliest date at which the minimum surface temperature (county-wide) reached 28&#176;F during the growing season. An early hard freeze can disrupt crop growth and prevent it from reaching maturity.</p>' +
    '<p>Four freeze layers are included, each representing a ranking of earliest hard freeze date per county: "1 of past 10 years" being the earliest hard freeze date during the growing season in the past ten years, "2 of past 10 years" being the second earliest, etc.</p>' +
    '<p>The absence of a hard freeze date value in the "1 of past 10 years" layer indicates no observed hard freeze in that county during the growing season over the past ten years. The absence of a hard freeze date value in the "2/5/8 of past 10 years" layers indicates either no observed hard freeze in that county during the growing season over the past ten years <i>or</i> not enough instances of hard freeze to represent the ranking. For example, a county whose minimum surface temperature reached 28&#176;F four times over the past ten growing seasons will not have a hard freeze date value in the "5 of past 10 years" layer.' +
    '<p><b>Latest silking date</b> is the latest date by which corn must "silk" in order to reach maturity, or "black layer," by the hard freeze date. The latest silking date is calculated using daily average "growing degree day" units ("GDD" or "GDU") from the past ten years, working back from a given hard freeze date.</p>' +
    '<p>GDU is calculated by taking the average of the minimum and maximum surface temperature on a given day and subtracting a crop-specific baseline temperature (50&#176;F for corn). Given a maximum temperature of 86&#176;F and minimum temperature of 70&#176;F on a given day, the calculation for GDU is: ((86+70)/2)-50 = 28.</p>' +
    '<p>Corn typically requires ~1300 GDU to transition from silking to maturity (and ~1400 from planting to silking, for a total of ~2700 GDU from planting to maturity). More information on GDU is available from Midwestern Regional Climate Center\'s <a href="https://mrcc.illinois.edu/U2U/gdd/aboutgdd.html">Usable to Useful</a> site.</p>';

    infoLightBoxFigure.appendChild(infoLightBoxFigureAnchor);
    infoLightBoxFigure.appendChild(infoLightBoxFigureCaption);
    infoLightBox.appendChild(infoLightBoxFigure);
    lightbox.appendChild(infoLightBox);

    var form = document.getElementById('form');
    form.className = 'map-overlay bottom-left';

    var title = document.createElement('div');
    title.id = 'title';
    title.className = 'form-menu title';
    title.innerHTML = '<h1>Freeze & Corn Growth</h1>' +
    '<p>How early does corn in your county</p>' +
    '<p>need to silk to reach maturity</p>' +
    '<p>before an early freeze?&nbsp;<a href="#about"><i class="fas fa-question-circle small" title="About"></i></a></p>'; // "&nbsp;" = non-breaking space
    form.appendChild(title);

    var fLayersToggle = document.createElement('div');
    fLayersToggle.id = 'f-layers-toggle';
    fLayersToggle.className = 'form-menu';

    var fLayersToggleLabelDiv = document.createElement('div');
    fLayersToggleLabelDiv.id = 'f-layers-toggle-label';
    fLayersToggleLabelDiv.className = 'form-label';

    var fLayersToggleLabel = document.createElement('label');
    fLayersToggleLabel.innerHTML = '<b>Earliest hard freeze</b> <span class="small">(28&#176;F)</span>'; // &#176; = HTML degree sign
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

    form.appendChild(fLayersToggle);

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
    datePickerLabel.innerHTML = '<b class="v-middle">Latest silking date</b>&nbsp;' +
    '<span class="small v-middle">(on/before)</span>';
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
          if (map.getLayer('counties-line')) {
            map.removeLayer('counties-line');
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
        if (map.getLayer('counties-line')) {
          map.removeLayer('counties-line');
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
          if (map.getLayer('counties-line')) {
            map.removeLayer('counties-line');
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
    form.appendChild(dateForm);

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
      // sql = 'select geoid, name || \' County\' as name, state_name, ' + fDoy + ', ' + fDate + ', ' + sDoy + ', ' + sDate + ', the_geom from first_freeze_28f where ' + fDoy + ' is not null and ' + sDate + ' <= ' + sDateFilter;
      sql = 'select geoid, name || \' County\' as name, state_name, ' + fDoy + ', ' + fDate + ', ' + sDoy + ', ' + sDate + ', the_geom from first_freeze_28f where ' + sDate + ' <= ' + sDateFilter;
    } else {
      // sql = 'select geoid, name || \' County\' as name, state_name, ' + fDoy + ', ' + fDate + ', ' + sDoy + ', ' + sDate + ', the_geom from first_freeze_28f where ' + fDoy + ' is not null';
      sql = 'select geoid, name || \' County\' as name, state_name, ' + fDoy + ', ' + fDate + ', ' + sDoy + ', ' + sDate + ', the_geom from first_freeze_28f';
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
    if (map.getLayer('counties-line')) {
      map.removeLayer('counties-line');
    }
    if (map.getSource('counties')) {
      map.removeSource('counties');
    }

    map.addSource('counties', {
      type: 'geojson',
      data: data
    });

    map.addLayer({
      id: 'counties',
      type: 'fill',
      source: 'counties',
      layout: {
        visibility: visibility
      },
      paint: {
        'fill-color': [
          'step',
          ['to-number', ['get', fDoy]],
          fillColors[0],
          breakpoints[0], fillColors[1],
          breakpoints[1], fillColors[2],
          breakpoints[2], fillColors[3],
          breakpoints[3], fillColors[4],
          breakpoints[4], fillColors[5],
          breakpoints[5], fillColors[6],
          breakpoints[6], fillColors[7],
          breakpoints[7], fillColors[8]
        ],
        'fill-opacity': 1
      }
    }, firstLabelLayer); // firstLabelLayer set on "map.on('style.load')"

    map.addLayer({
      id: 'counties-line',
      type: 'line',
      source: 'counties',
      layout: {
        visibility: visibility
      },
      paint: {
        'line-color': '#fff',
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          // when zoom <= 4, line-width: 0.5
          4, 0.25,
          // when zoom >= 9, line-width: 1.2
          9, 1.2
          // in between, line-width will be linearly interpolated between 0.5 and 1.2 pixels
        ]
      }
    }, firstLabelLayer); // firstLabelLayer set on "map.on('style.load')"

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
      '<p class="small" style="margin-top: 2px">' + fLayer.substring(0, 1) + ' of past 10 years</p><p>';

      if (props[fDate] !== 'null') {
        popupContent += props[fDate] + '</p>';
      } else {
        popupContent += 'N/A</p>';
      }

      popupContent += '<p><b>Latest Silking Date</b></p><p>';

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
