;(function($){
    $.fn.geoDjangoPoint = function(tabOptions) {
        // support mutltiple elements
        if (this.length > 1){
            this.each(function() { $(this).geoDjangoPoint(tabOptions) });
            return this;
        }

        var point = this;
        point.map = null;
        point.controls = null;
        point.panel = null;
        point.re = new RegExp("^SRID=\d+;(.+)", "i");
        point.layers = {};
        point.modifiable = true;
        point.wkt_f = new OpenLayers.Format.WKT();
        point.is_collection = false;
        point.collection_type = 'None';
        point.is_linestring = false;
        point.is_polygon = false;
        point.is_point = true;

        // setup options
        var defaultOptions = {
            debug : false
        };
        var options = $.extend({}, defaultOptions, tabOptions);

        console.log(options);

        var intialize = function() {
            // add anchor to remove map points
            var clear = $('<a>').attr('href', '#').text('Delete all features');
            clear.click(function(e) {
                e.preventDefault();
                point.clearFeatures();
            });
            clear.insertAfter($('point'));
            // The options hash, w/ zoom, resolution, and projection settings.
            var ol_options = {
                'projection' : new OpenLayers.Projection("EPSG:4326"),
                'numZoomLevels' : 18
            };
            // The admin map for this geometry field.
            point.map = new OpenLayers.Map($(point).attr('id') + '_map', ol_options);
            // Base Layer
            point.layers.base = new OpenLayers.Layer.WMS( "OpenLayers WMS", "http://labs.metacarta.com/wms/vmap0", {layers: 'basic'} );
            point.map.addLayer(point.layers.base);
            
            point.layers.vector = new OpenLayers.Layer.Vector(" point");
            point.map.addLayer(point.layers.vector);
            // Read WKT from the text field.
            var wkt = $(point).val();

            if (wkt) {
                // After reading into geometry, immediately write back to
                // WKT <textarea> as EWKT (so that SRID is included).
                var admin_geom = point.read_wkt(wkt);
                point.write_wkt(admin_geom);
                if (point.is_collection) {
                    // If geometry collection, add each component individually so they may be
                    // edited individually.
                    for (var i = 0; i < point.num_geom; i++){
                        point.layers.vector.addFeatures([new OpenLayers.Feature.Vector(admin_geom.geometry.components[i].clone())]);
                    }
                } else {
                    point.layers.vector.addFeatures([admin_geom]);
                }
                // Zooming to the bounds.
                point.map.zoomToExtent(admin_geom.geometry.getBounds());
                if (point.is_point){
                    point.map.zoomTo(12);
                }
            } else {
                point.map.setCenter(new OpenLayers.LonLat(0, 0), 4);
            }
            // This allows editing of the geographic fields -- the modified WKT is
            // written back to the content field (as EWKT, so that the ORM will know
            // to transform back to original SRID).
            point.layers.vector.events.on({"featuremodified" : point.modify_wkt});
            point.layers.vector.events.on({"featureadded" : point.add_wkt});
            
            // Map controls:
            // Add geometry specific panel of toolbar controls
            point.getControls(point.layers.vector);
            point.panel.addControls(point.controls);
            point.map.addControl(point.panel);
            point.addSelectControl();
            // Then add optional visual controls
            point.map.addControl(new OpenLayers.Control.MousePosition());
            point.map.addControl(new OpenLayers.Control.Scale());
            point.map.addControl(new OpenLayers.Control.LayerSwitcher());

            // Then add optional behavior controls
            if (wkt){
                if (point.modifiable){
                    point.enableEditing();
                }
            } else {
                point.enableDrawing();
            }

            return point;
        };

        // PUBLIC functions //
        this.getOptions = function() {
            return options;
        };

        this.get_ewkt = function(feat) {
            return 'SRID=4326;' + point.wkt_f.write(feat);
        };

        this.read_wkt = function(wkt) {
            // OpenLayers cannot handle EWKT -- we make sure to strip it out.
            // EWKT is only exposed to OL if there's a validation error in the admin.
            var match = point.re.exec(wkt);
            if (match){wkt = match[1];}
            return point.wkt_f.read(wkt);
        };

        this.write_wkt = function(feat) {
            if (point.is_collection) {
                point.num_geom = feat.geometry.components.length;
            } else {
                point.num_geom = 1;
            }
            $(point).val(point.get_ewkt(feat));
        };

        this.add_wkt = function(event) {
            // This function will sync the contents of the `vector` layer with the
            // WKT in the text field.
            if (point.is_collection) {
                var feat = new OpenLayers.Feature.Vector(new OpenLayers.Geometry.Point());
                for (var i = 0; i < point.layers.vector.features.length; i++){
                    feat.geometry.addComponents([point.layers.vector.features[i].geometry]);
                }
                point.write_wkt(feat);
            } else {
                // Make sure to remove any previously added features.
                if (point.layers.vector.features.length > 1) {
                    old_feats = [point.layers.vector.features[0]];
                    point.layers.vector.removeFeatures(old_feats);
                    point.layers.vector.destroyFeatures(old_feats);
                }
                point.write_wkt(event.feature);
            }
        };

        this.modify_wkt = function(event) {
            if (point.is_collection) {
                if (point.is_point) {
                    point.add_wkt(event);
                    return;
                } else {
                    // When modifying the selected components are added to the
                    // vector layer so we only increment to the `num_geom` value.
                    var feat = new OpenLayers.Feature.Vector(new OpenLayers.Geometry.Point());
                    for (var i = 0; i < point.num_geom; i++){
                        feat.geometry.addComponents([point.layers.vector.features[i].geometry]);
                    }
                    point.write_wkt(feat);
                }
            } else {
                point.write_wkt(event.feature);
            }
        };

        this.deleteFeatures = function() {
            point.layers.vector.removeFeatures(point.layers.vector.features);
            point.layers.vector.destroyFeatures();
        };

        this.clearFeatures = function () {
            point.deleteFeatures();
            $(point).val('');
            point.map.setCenter(new OpenLayers.LonLat(0, 0), 4);
        };

        this.addSelectControl = function() {
            var select = new OpenLayers.Control.SelectFeature(point.layers.vector, {'toggle' : true, 'clickout' : true});
            point.map.addControl(select);
            select.activate();
        };

        this.enableDrawing = function() {
            point.map.getControlsByClass('OpenLayers.Control.DrawFeature')[0].activate();
        };

        this.enableEditing = function() {
            point.map.getControlsByClass('OpenLayers.Control.ModifyFeature')[0].activate();
        };

        this.getControls = function(lyr) {
            point.panel = new OpenLayers.Control.Panel({'displayClass': 'olControlEditingToolbar'});
            var nav = new OpenLayers.Control.Navigation();
            var draw_ctl;
            if (point.is_linestring){
                draw_ctl = new OpenLayers.Control.DrawFeature(lyr, OpenLayers.Handler.Path, {'displayClass': 'olControlDrawFeaturePath'});
            } else if (point.is_polygon){
                draw_ctl = new OpenLayers.Control.DrawFeature(lyr, OpenLayers.Handler.Polygon, {'displayClass': 'olControlDrawFeaturePolygon'});
            } else if (point.is_point){
                draw_ctl = new OpenLayers.Control.DrawFeature(lyr, OpenLayers.Handler.Point, {'displayClass': 'olControlDrawFeaturePoint'});
            }
            if (point.modifiable){
                var mod = new OpenLayers.Control.ModifyFeature(lyr, {'displayClass': 'olControlModifyFeature'});
                point.controls = [nav, draw_ctl, mod];
            } else {
                if(!lyr.features.length){
                    point.controls = [nav, draw_ctl];
                } else {
                    point.controls = [nav];
                }
            }
        };

        return intialize();
    }
})(django.jQuery);
