/*
 * L.TileLayer.PixelFilter
 * https://github.com/greeninfo/L.TileLayer.PixelFilter
 * http://greeninfo-network.github.io/L.TileLayer.PixelFilter/
 */
L.tileLayerPixelFilter = function (url, options) {
    return new L.TileLayer.PixelFilter(url, options);
}

L.TileLayer.PixelFilter = L.TileLayer.extend({
    // the constructor saves settings and throws a fit if settings are bad, as typical
    // then adds the all-important 'tileload' event handler which basically "detects" an unmodified tile and performs the pxiel-swap
    initialize: function (url, options) {
        options = L.extend(L.TileLayer.prototype.options, {
            matchRGBA: [ 255, 0, 0, 128 ],
            missRGBA: [ 0, 0, 0, 0 ],
            pixelCodes: []
        }, options);
        L.TileLayer.prototype.initialize.call(this, url, options);
        L.setOptions(this, options);

        // go ahead and save our settings
        this.setMatchRGBA(this.options.matchRGBA);
        this.setMissRGBA(this.options.missRGBA);
        this.setPixelCodes(this.options.pixelCodes);

        // and add our tile-load event hook which triggers us to do the pixel-swap
        this.on('tileload', function (event) {
            this.applyFiltersToTile(event.tile);
        });
    },

    // settings setters
    setMatchRGBA: function (rgba) {
        // save the setting
        if (typeof rgba !== 'object' || typeof rgba.length !== 'number' || rgba.length !== 4) throw "L.TileLayer.PixelSwap expected matchRGBA to be RGBA [r,g,b,a] array";
        this.options.matchRGBA = rgba;

        // force a redraw, which means new tiles, which mean new tileload events; the circle of life
        this.redraw(true);
    },
    setMissRGBA: function (rgba) {
        // save the setting
        if (typeof rgba !== 'object' || typeof rgba.length !== 'number' || rgba.length !== 4) throw "L.TileLayer.PixelSwap expected missRGBA to be RGBA [r,g,b,a] array";
        this.options.missRGBA = rgba;

        // force a redraw, which means new tiles, which mean new tileload events; the circle of life
        this.redraw(true);
    },
    setPixelCodes: function (pixelcodes) {
        // save the setting
        if (typeof pixelcodes !== 'object' || typeof pixelcodes.length !== 'number') throw "L.TileLayer.PixelSwap expected pixelCodes to be a list of triplets: [ [r,g,b], [r,g,b], ... ]";
        this.options.pixelCodes = pixelcodes;

        // force a redraw, which means new tiles, which mean new tileload events; the circle of life
        this.redraw(true);
    },

    // the heavy lifting to do the pixel-swapping
    // called upon 'tileload' and passed the IMG element
    // tip: when the tile is saved back to the IMG element that counts as a tileload event too! thus an infinite loop, as wel as comparing the pixelCodes against already-replaced pixels!
    //      so, we tag the already-swapped tiles so we know when to quit
    // if the layer is redrawn, it's a new IMG element and that means it would not yet be tagged
    applyFiltersToTile: function (imgelement) {
        // already processed, see note above
        if (imgelement.already_pixel_swapped) return;

        // copy the image data onto a canvas for manipulation
        var width  = imgelement.width;
        var height = imgelement.height;
        var canvas    = document.createElement("canvas");
        canvas.width  = width;
        canvas.height = height;
        var context = canvas.getContext("2d");
        context.drawImage(imgelement, 0, 0);

        // create our target imagedata
        var output = context.createImageData(width, height);

        // extract out our RGBA trios into separate numbers, so we don't have to use rgba[i] a zillion times
        var match_r = this.options.matchRGBA[0], match_g = this.options.matchRGBA[1], match_b = this.options.matchRGBA[2], match_a = this.options.matchRGBA[3];
        var miss_r  = this.options.missRGBA[0], miss_g  = this.options.missRGBA[1], miss_b  = this.options.missRGBA[2], miss_a  = this.options.missRGBA[3];

        // go over our pixel-code list and generate the list of integers that we'll use for RGB matching
        // 1000000*R + 1000*G + B = 123123123 which is an integer, and finding an integer inside an array is a lot faster than finding an array inside an array
        var pixelcodes = [];
        for (var i=0, l=this.options.pixelCodes.length; i<l; i++) {
            var value = 1000000 * this.options.pixelCodes[i][0] + 1000 * this.options.pixelCodes[i][1] + this.options.pixelCodes[i][2];
            pixelcodes.push(value);
        }

        // iterate over the pixels (each one is 4 bytes, RGBA)
        // and see if they are on our list (recall the "addition" thing so we're comparing integers in an array for performance)
        var pixels = context.getImageData(0, 0, width, height).data;
        for(var i = 0, n = pixels.length; i < n; i += 4) {
            var r = pixels[i  ];
            var g = pixels[i+1];
            var b = pixels[i+2];
            var a = pixels[i+3];

            // bail condition: if the alpha is 0 then it's already transparent, likely nodata, and we should skip it
            if (a == 0) {
                output.data[i  ] = 255;
                output.data[i+1] = 255;
                output.data[i+2] = 255;
                output.data[i+3] = 0;
                continue;
            }

            // default to matching, so that if we are not in fact filtering by code it's an automatic hit
            // number matching trick: 1000000*R + 1000*G + 1*B = 123,123,123 a simple number that either is or isn't on the list
            var match = true;
            if (pixelcodes.length) {
                var sum = 1000000 * r + 1000 * g + b;
                if (-1 === pixelcodes.indexOf(sum)) match = false;
            }

            // did it match? either way we push a R, a G, and a B onto the image blob
            output.data[i  ] = match ? match_r : miss_r;
            output.data[i+1] = match ? match_g : miss_g;
            output.data[i+2] = match ? match_b : miss_b;
            output.data[i+3] = match ? match_a : miss_a;
        }

        // write the image back to the canvas, and assign its base64 back into the on-screen tile to visualize the change
        // tag the tile as having already been updated, so we don't process a 'load' event again and re-process a tile that surely won't match any target RGB codes, in an infinite loop!
        context.putImageData(output, 0, 0);
        imgelement.already_pixel_swapped = true;
        imgelement.src = canvas.toDataURL();
    }
});