export function constructArcGisWebMap(layerName: string, layerUrl: string) {
  const template = `
<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd">
<html>
<head>
<title>ArcGIS API for JavaScript: ${layerName}</title>
<meta charset="utf-8">
<meta name="viewport" content="initial-scale=1, maximum-scale=1,user-scalable=no">
<!-- Favorite Bookmark Icon -->
<link rel="shortcut icon" type="image/ico" href="//www.esri.com/favicon.ico" />
<link rel="icon" type="image/ico" href="//www.esri.com/favicon.ico" />
<!-- End Favorite Bookmark Icon --> <style>
H2 {
  MARGIN-LEFT: 0px; FONT-WEIGHT: bold; FONT-SIZE: 1.2em
}
H3 {
  FONT-WEIGHT: bold; FONT-SIZE: 1.25em; MARGIN-BOTTOM: 0px; 
}
.grid-container {
  padding-top: 0px;
  padding-bottom: 0px;
  padding-right: 10px;
  padding-left: 10px;
  background-color: #2D2670;
  color: #ffffff;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-template-rows: repeat(2, 1fr);
  gap: 10px;
  grid-template-areas:
    "a a b c"
    "a a b c";
  align-items: start;
}
.item1 {
  grid-area: a;
  font-size: 1em;
  font-weight: bold;
}
.item2 {
  grid-area: c;
  font-size: 1em;
  align-self: end;
  text-align: right;
  font-weight: bold;
}
.breadcrumb {
  color: #009AF2;
}
.breadcrumb:hover {
  color: #007AC2;
  cursor: pointer;
}
.message {
  font-weight: 400;
  font-size: smaller;
  cursor: default;
  padding-top: 5px;
  display: none;
  margin-left: 10px;
  color: #800000;
  white-space: normal;
}
#bottomPane {
  padding: 8px;
  background-color: #ffffff;
  text-align: center;
}
#txtUrl {
  padding-top: 2px;
  padding-bottom: 2px;
  padding-left: 5px;
  padding-right: 5px;
  color: #000000;
  background-color: #E7E9EB;
}
#titleEl {
  font-weight: bold; 
  margin-bottom: 5px;
}
.switch {
  position: relative;
  display: inline-block;
  width: 45px;
  height: 22px;
  vertical-align: middle;
}
.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}
.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #cccccc;
  -webkit-transition: 0.4s;
  transition: 0.4s;
}

.slider:before {
  position: absolute;
  content: "";
  height: 20px;
  width: 20px;
  left: 3px;
  bottom: 1px;
  background-color: white;
  -webkit-transition: 0.4s;
  transition: 0.4s;
}

input:checked+.slider {
  background-color: #2196f3;
}

input:focus+.slider {
  box-shadow: 0 0 1px #2196f3;
}

input:checked+.slider:before {
  -webkit-transform: translateX(20px);
  -ms-transform: translateX(20px);
  transform: translateX(20px);
}
/* Rounded sliders */
.slider.round {
  border-radius: 20px;
}
.slider.round:before {
  border-radius: 50%;
}
.labelText {
  padding-left: 5px;
  font-size: 15px;
}
#mainDiv {
  padding: 8px;
}
</style>
<link href="https://js.arcgis.com/4.32/esri/css/main.css" rel="stylesheet" type="text/css" />
<script type="text/javascript" src="https://js.arcgis.com/4.32/"></script>
<style>
html,
body,
#viewDiv {
  padding: 0;
  margin: 0;
  height: 97.5%;
  width: 100%;
}
</style>
<script type="text/javascript">
require([
"esri/Map",
"esri/views/MapView",
"esri/widgets/Home",
"esri/widgets/ScaleBar",
"esri/widgets/LayerList",
"esri/widgets/Legend",
"esri/widgets/Expand",
"esri/widgets/Compass",
"esri/layers/Layer"
], (
Map, MapView, Home, ScaleBar, LayerList, Legend,
Expand, Compass, Layer
) => {
  const layerUrl = "${layerUrl}";
  const map = new Map();
  const view = new MapView({
    container: "viewDiv",
    map: map
  });
  createFeatureLayers(layerUrl);
  async function createFeatureLayers(url) {
    const featureService = await Layer.fromArcGISServerUrl(url);
    map.add(featureService);
  }
  const homeBtn = new Home({
    view: view
  });
  const scaleBar = new ScaleBar({
    view: view,
    unit: "dual"
  });
  const layerList = new LayerList({
    view: view
  });
  const legend = new Legend({
    view: view
  });
  const layerListExpand = new Expand({
    view: view,
    content: layerList,
    expanded: false,
    expandTooltip: "Expand LayerList"
  });
  const legendExpand = new Expand({
    view: view,
    content: legend,
    expandTooltip: "Expand Legend",
    expanded: false
  });
  const compass = new Compass({
    view: view,
    visible: false
  });
  view.ui.add(homeBtn, "top-left");
  view.ui.add(scaleBar, "bottom-right");
  view.ui.add(layerListExpand, "top-right");
  view.ui.add(legendExpand, "bottom-left");
  view.ui.add(compass, "top-left");
  // load the Compass only when the view is rotated
  view.watch('rotation', function (rotation) {
    if (rotation && !compass.visible) {
      compass.visible = true;
    }
  });
});
</script>
</head>
<body>
<div class="grid-container">
<div class="item1">
<p>ArcGIS API for JavaScript: ${layerName}</p>
</div>
<div class="item2">
<p>Built using the <a class="breadcrumb" href="https://developers.arcgis.com/javascript/" target="sdkView">ArcGIS API for JavaScript</a></p>
</div>
</div>
<div id="viewDiv"></div>
</body>
</html>
`;

  return template;
}
