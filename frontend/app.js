// TERRA Frontend Application Logic

// Initialize map
const map = L.map('map', {
    zoomControl: false // We will move it to bottom right later
}).setView([20.0, 73.78], 13);

// Add zoom control to bottom right
L.control.zoom({
    position: 'bottomright'
}).addTo(map);

// Add Esri World Imagery (Satellite Base Map)
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
}).addTo(map);

// State variables
let points = [];
let markers = [];
let drawnPolygon = null;
let gridLayers = [];
let selectedGridSquare = null;
let isDrawingPhase = true;

// DOM Elements
const instructionText = document.getElementById('instruction-text');
const resetBtn = document.getElementById('reset-btn');
const analyzeBtn = document.getElementById('analyze-btn'); // Now "Finish Drawing"
const resultsSection = document.getElementById('results-section');
const loadingState = document.getElementById('loading-state');
const dataState = document.getElementById('data-state');
const errorState = document.getElementById('error-state');
const coordsDisplay = document.getElementById('coords-display');
const errorMessage = document.getElementById('error-message');

// Custom marker icon
const customIcon = L.divIcon({
    className: 'custom-marker',
    iconSize: [12, 12],
    iconAnchor: [6, 6]
});

// Map click handler - for drawing polygon
map.on('click', function(e) {
    if (!isDrawingPhase) return;

    const latlng = e.latlng;
    points.push(latlng);

    // Add marker
    const marker = L.marker(latlng, { icon: customIcon }).addTo(map);
    markers.push(marker);

    // Update UI step indicator
    updateStepIndicator(1); // Still on step 1 (Drawing)
    resetBtn.disabled = false;

    // Draw line/polygon
    if (points.length > 1) {
        if (drawnPolygon) {
            map.removeLayer(drawnPolygon);
        }
        
        // Draw open polygon (polyline) while drawing
        drawnPolygon = L.polygon(points, {
            color: '#10b981',
            weight: 2,
            opacity: 0.8,
            fillColor: '#10b981',
            fillOpacity: 0.1,
            dashArray: '5, 5'
        }).addTo(map);
    }

    if (points.length >= 3) {
        analyzeBtn.disabled = false;
        instructionText.textContent = `Polygon has ${points.length} points. Click "Finish Drawing" to generate the analysis grid.`;
    } else {
        analyzeBtn.disabled = true;
        instructionText.textContent = `Click ${3 - points.length} more point(s) to form a valid shape.`;
    }
});

function updateStepIndicator(step) {
    for (let i = 1; i <= 3; i++) {
        const stepEl = document.getElementById(`step-${i}`);
        if (i < step) {
            stepEl.className = 'step completed';
            stepEl.innerHTML = '✓';
        } else if (i === step) {
            stepEl.className = 'step active';
            stepEl.innerHTML = i;
        } else {
            stepEl.className = 'step';
            stepEl.innerHTML = i;
        }
    }
}

// Reset functionality
resetBtn.addEventListener('click', resetApp);

function resetApp() {
    // Clear map
    markers.forEach(m => map.removeLayer(m));
    if (drawnPolygon) map.removeLayer(drawnPolygon);
    gridLayers.forEach(layer => map.removeLayer(layer));
    if (selectedGridSquare) map.removeLayer(selectedGridSquare);
    
    // Reset state
    points = [];
    markers = [];
    drawnPolygon = null;
    gridLayers = [];
    selectedGridSquare = null;
    isDrawingPhase = true;
    
    // Reset UI
    updateStepIndicator(1);
    
    resetBtn.disabled = true;
    analyzeBtn.disabled = true;
    analyzeBtn.textContent = "Finish Drawing";
    analyzeBtn.classList.remove('hidden');
    instructionText.textContent = "Click multiple points on the map to draw a field polygon. Then click 'Finish Drawing'.";
    
    resultsSection.classList.add('hidden');
}

// Finish Drawing & Generate Grid functionality
analyzeBtn.addEventListener('click', () => {
    if (points.length < 3) return;

    // Transition state
    isDrawingPhase = false;
    analyzeBtn.classList.add('hidden'); // Hide the finish button
    instructionText.textContent = "Grid generated. Click on any square to analyze its satellite data.";
    updateStepIndicator(2); // Move to Step 2 (Grid Gen)
    
    // Solidify the drawn polygon
    if (drawnPolygon) {
        map.removeLayer(drawnPolygon);
    }
    drawnPolygon = L.polygon(points, {
        color: '#10b981',
        weight: 3,
        opacity: 0.8,
        fillColor: '#10b981',
        fillOpacity: 0.05
    }).addTo(map);

    // Remove markers for cleaner look
    markers.forEach(m => map.removeLayer(m));
    markers = [];

    // Generate Grid using Turf.js
    generateGrid();
});

function generateGrid() {
    // 1. Create a Turf polygon from our points
    // GeoJSON coordinates are [longitude, latitude]
    const turfCoords = points.map(p => [p.lng, p.lat]);
    // Close the ring
    turfCoords.push([points[0].lng, points[0].lat]);
    
    const turfPolygon = turf.polygon([turfCoords]);
    
    // 2. Get bounding box of the polygon
    const bbox = turf.bbox(turfPolygon);
    
    // 3. Generate square grid over the bounding box
    // Size is in kilometers. 50m = 0.05km
    const cellSide = 0.05; 
    const options = { units: 'kilometers' };
    const grid = turf.squareGrid(bbox, cellSide, options);
    
    // 4. Filter grid squares that intersect with our drawn polygon
    const intersectingSquares = [];
    turf.featureEach(grid, function (currentFeature) {
        if (turf.booleanIntersects(turfPolygon, currentFeature)) {
            intersectingSquares.push(currentFeature);
        }
    });

    updateStepIndicator(3); // Step 3: Select Square

    if (intersectingSquares.length === 0) {
        instructionText.textContent = "Polygon too small for the grid resolution. Please reset and draw a larger area.";
        return;
    }

    // 5. Draw the filtered grid on the map
    intersectingSquares.forEach((square, index) => {
        // Turf uses GeoJSON [lng, lat], Leaflet uses [lat, lng]
        const leafletCoords = square.geometry.coordinates[0].map(coord => [coord[1], coord[0]]);
        
        const gridLayer = L.polygon(leafletCoords, {
            color: '#3b82f6', // Accent blue
            weight: 1,
            opacity: 0.5,
            fillColor: '#3b82f6',
            fillOpacity: 0.1,
            className: 'grid-square'
        }).addTo(map);

        // Hover effects
        gridLayer.on('mouseover', function() {
            if (this !== selectedGridSquare) {
                this.setStyle({ fillOpacity: 0.3, color: '#60a5fa', weight: 2 });
            }
        });
        gridLayer.on('mouseout', function() {
            if (this !== selectedGridSquare) {
                this.setStyle({ fillOpacity: 0.1, color: '#3b82f6', weight: 1 });
            }
        });

        // Click handler to select and analyze
        gridLayer.on('click', function() {
            selectAndAnalyzeSquare(this, square.geometry.coordinates[0]);
        });

        gridLayers.push(gridLayer);
    });
}

async function selectAndAnalyzeSquare(layer, geoJsonCoords) {
    // Reset previous selection style
    if (selectedGridSquare) {
        selectedGridSquare.setStyle({
            color: '#3b82f6',
            weight: 1,
            fillColor: '#3b82f6',
            fillOpacity: 0.1
        });
    }

    // Highlight new selection
    selectedGridSquare = layer;
    selectedGridSquare.setStyle({
        color: '#f59e0b', // Warning/Amber color to highlight
        weight: 3,
        fillColor: '#f59e0b',
        fillOpacity: 0.4
    });

    // Extract coordinates in [lng, lat] format for Backend
    const coordinates = geoJsonCoords.slice(0, 4); // Take the 4 corners
    
    // Display coordinates nicely in UI
    const displayCoords = coordinates.map((p, i) => `P${i+1}: [${p[1].toFixed(5)}, ${p[0].toFixed(5)}]`).join('\n');
    coordsDisplay.textContent = displayCoords;

    instructionText.textContent = "Analyzing selected square...";
    
    // Show loading state
    resultsSection.classList.remove('hidden');
    loadingState.classList.remove('hidden');
    dataState.classList.add('hidden');
    errorState.classList.add('hidden');

    try {
        // Send to backend
        const response = await fetch('http://127.0.0.1:8000/api/analyze-region', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ coordinates: coordinates })
        });

        if (!response.ok) {
            let errDetail = "";
            try {
                const errData = await response.json();
                errDetail = errData.detail || "";
            } catch (e) {}
            throw new Error(`Server error: ${response.status} ${errDetail}`);
        }

        const data = await response.json();
        
        // Update UI with results
        document.getElementById('ndvi-value').textContent = data.ndvi !== null ? data.ndvi.toFixed(3) : "N/A";
        document.getElementById('ndwi-value').textContent = data.ndwi !== null ? data.ndwi.toFixed(3) : "N/A";
        
        // Set trend styling based on values
        updateTrend('ndvi', data.ndvi);
        updateTrend('ndwi', data.ndwi);

        // Show data
        loadingState.classList.add('hidden');
        dataState.classList.remove('hidden');
        instructionText.textContent = "Analysis complete. Select another square to analyze.";

    } catch (error) {
        console.error("Error analyzing region:", error);
        loadingState.classList.add('hidden');
        errorState.classList.remove('hidden');
        errorMessage.textContent = error.message.includes('404') 
            ? "No cloud-free satellite imagery found for this square recently." 
            : "Could not connect to the backend or processing failed.";
        instructionText.textContent = "Analysis failed. Try selecting another square.";
    }
}

function updateTrend(metric, value) {
    const trendEl = document.querySelector(`#${metric}-value + .metric-trend`);
    
    if (value === null) {
        trendEl.className = 'metric-trend neutral';
        trendEl.textContent = 'No Data';
        return;
    }
    
    if (metric === 'ndvi') {
        if (value > 0.6) {
            trendEl.className = 'metric-trend positive';
            trendEl.textContent = 'Healthy Vigor';
        } else if (value > 0.3) {
            trendEl.className = 'metric-trend neutral';
            trendEl.textContent = 'Moderate Vigor';
        } else {
            trendEl.className = 'metric-trend warning';
            trendEl.textContent = 'Low Vigor / Stress';
        }
    } else if (metric === 'ndwi') {
        if (value > 0) {
            trendEl.className = 'metric-trend positive';
            trendEl.textContent = 'High Moisture';
        } else if (value > -0.2) {
            trendEl.className = 'metric-trend neutral';
            trendEl.textContent = 'Optimal Water';
        } else {
            trendEl.className = 'metric-trend warning';
            trendEl.textContent = 'Water Stress';
        }
    }
}
