// TERRA Frontend Application Logic

// Initialize map
const map = L.map('map', {
    zoomControl: false
}).setView([20.0, 73.78], 13);

L.control.zoom({ position: 'bottomright' }).addTo(map);

L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri'
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
const analyzeBtn = document.getElementById('analyze-btn'); 
const resultsSection = document.getElementById('results-section');
const loadingState = document.getElementById('loading-state');
const dataState = document.getElementById('data-state');
const errorState = document.getElementById('error-state');
const coordsDisplay = document.getElementById('coords-display');
const errorMessage = document.getElementById('error-message');

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

    const marker = L.marker(latlng, { icon: customIcon }).addTo(map);
    markers.push(marker);

    updateStepIndicator(1);
    resetBtn.disabled = false;

    if (points.length > 1) {
        if (drawnPolygon) map.removeLayer(drawnPolygon);
        
        drawnPolygon = L.polygon(points, {
            color: '#10b981', weight: 2, opacity: 0.8,
            fillColor: '#10b981', fillOpacity: 0.1, dashArray: '5, 5'
        }).addTo(map);
    }

    if (points.length >= 3) {
        analyzeBtn.disabled = false;
        instructionText.textContent = `Polygon has ${points.length} points. Click "Finish Drawing" to analyze field health.`;
    } else {
        analyzeBtn.disabled = true;
        instructionText.textContent = `Click ${3 - points.length} more point(s) to form a valid shape.`;
    }
});

function updateStepIndicator(step) {
    for (let i = 1; i <= 3; i++) {
        const stepEl = document.getElementById(`step-${i}`);
        if (i < step) {
            stepEl.className = 'step completed'; stepEl.innerHTML = '✓';
        } else if (i === step) {
            stepEl.className = 'step active'; stepEl.innerHTML = i;
        } else {
            stepEl.className = 'step'; stepEl.innerHTML = i;
        }
    }
}

resetBtn.addEventListener('click', resetApp);

function resetApp() {
    markers.forEach(m => map.removeLayer(m));
    if (drawnPolygon) map.removeLayer(drawnPolygon);
    gridLayers.forEach(layer => map.removeLayer(layer));
    if (selectedGridSquare) map.removeLayer(selectedGridSquare);
    
    points = []; markers = []; drawnPolygon = null;
    gridLayers = []; selectedGridSquare = null; isDrawingPhase = true;
    
    updateStepIndicator(1);
    resetBtn.disabled = true; analyzeBtn.disabled = true;
    analyzeBtn.textContent = "Finish Drawing"; analyzeBtn.classList.remove('hidden');
    instructionText.textContent = "Click multiple points on the map to draw a field polygon.";
    resultsSection.classList.add('hidden');
}

analyzeBtn.addEventListener('click', async () => {
    if (points.length < 3) return;

    isDrawingPhase = false;
    analyzeBtn.classList.add('hidden');
    updateStepIndicator(2);
    
    if (drawnPolygon) map.removeLayer(drawnPolygon);
    drawnPolygon = L.polygon(points, {
        color: '#10b981', weight: 3, opacity: 0.8,
        fillColor: '#10b981', fillOpacity: 0.05
    }).addTo(map);

    markers.forEach(m => map.removeLayer(m));
    markers = [];

    await generateAndAnalyzeGrid();
});

function getColorForNDVI(ndvi) {
    if (ndvi === null) return '#9ca3af'; // Gray for no data
    if (ndvi > 0.6) return '#10b981'; // Green: High Vigor
    if (ndvi > 0.3) return '#facc15'; // Yellow: Moderate
    return '#ef4444'; // Red: Low Vigor / Stress
}

async function generateAndAnalyzeGrid() {
    instructionText.textContent = "Generating grid and fetching live health data...";
    resultsSection.classList.remove('hidden');
    loadingState.classList.remove('hidden');
    dataState.classList.add('hidden');
    errorState.classList.add('hidden');

    const turfCoords = points.map(p => [p.lng, p.lat]);
    turfCoords.push([points[0].lng, points[0].lat]);
    const turfPolygon = turf.polygon([turfCoords]);
    const bbox = turf.bbox(turfPolygon);
    
    const cellSide = 0.05; // 50m
    const grid = turf.squareGrid(bbox, cellSide, { units: 'kilometers' });
    
    const intersectingSquares = [];
    turf.featureEach(grid, function (currentFeature) {
        // Use intersect to get the exact clipped shape
        const intersection = turf.intersect(turfPolygon, currentFeature);
        if (intersection) {
            if (intersection.geometry.type === 'Polygon') {
                intersectingSquares.push({type: 'Feature', geometry: intersection.geometry});
            } else if (intersection.geometry.type === 'MultiPolygon') {
                // A single square might be cut into multiple disconnected polygons at sharp edges.
                // We must process each piece individually so no area is lost!
                intersection.geometry.coordinates.forEach(polyCoords => {
                    intersectingSquares.push({
                        type: 'Feature', 
                        geometry: { type: 'Polygon', coordinates: polyCoords }
                    });
                });
            }
            // Ignore Points or LineStrings (touching perfectly on the edge with no area)
        }
    });

    if (intersectingSquares.length === 0) {
        instructionText.textContent = "Polygon too small for 50m grid. Reset and draw a larger area.";
        loadingState.classList.add('hidden');
        return;
    }

    // Prepare grid for batch backend request
    const polygonsPayload = intersectingSquares.map(sq => sq.geometry.coordinates[0]);

    // Draw initial gray grid
    intersectingSquares.forEach((square, index) => {
        const coordsList = square.geometry.coordinates[0];
            
        const leafletCoords = coordsList.map(c => [c[1], c[0]]);
        const gridLayer = L.polygon(leafletCoords, {
            color: '#ffffff', weight: 1, opacity: 0.5,
            fillColor: '#9ca3af', fillOpacity: 0.4, className: 'grid-square'
        }).addTo(map);
        
        gridLayer.gridId = index;
        gridLayer.geoJsonCoords = coordsList;
        gridLayers.push(gridLayer);
    });

    try {
        const response = await fetch('http://127.0.0.1:8000/api/analyze-grid', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ polygons: polygonsPayload })
        });

        if (!response.ok) throw new Error("Backend failed to process grid");
        
        const data = await response.json();
        
        // Color code grid based on health
        gridLayers.forEach((layer) => {
            const result = data.results.find(r => r.id === layer.gridId);
            if (result) {
                layer.satData = result; // cache data
                const color = getColorForNDVI(result.ndvi);
                layer.baseColor = color;
                layer.setStyle({ fillColor: color, fillOpacity: 0.6, color: '#ffffff', weight: 1 });
                
                layer.on('mouseover', function() {
                    if (this !== selectedGridSquare) this.setStyle({ fillOpacity: 0.8, weight: 2 });
                });
                layer.on('mouseout', function() {
                    if (this !== selectedGridSquare) this.setStyle({ fillOpacity: 0.6, weight: 1 });
                });
                layer.on('click', function() { selectAndAnalyzeSquare(this); });
            }
        });

        updateStepIndicator(3);
        instructionText.textContent = "Health map generated! Click any square to view specific insights and weather.";
        loadingState.classList.add('hidden');
        
    } catch (error) {
        console.error(error);
        loadingState.classList.add('hidden');
        errorState.classList.remove('hidden');
        errorMessage.textContent = "Failed to load satellite data. Please check connection.";
    }
}

async function fetchWeather(lat, lng) {
    try {
        // Fetch 3 day forecast: max temp and precip sum
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=precipitation_sum,temperature_2m_max&timezone=auto&forecast_days=3`);
        const data = await res.json();
        return data.daily;
    } catch (e) {
        console.error("Weather failed", e);
        return null;
    }
}

function generateAdvice(ndvi, ndwi, weather) {
    if (ndvi === null) return "No satellite data available for this sector.";
    
    let advice = "";
    
    // Water stress logic
    if (ndwi < -0.1) {
        advice += "⚠️ High Water Stress. ";
        if (weather && weather.precipitation_sum && weather.precipitation_sum[0] > 5) {
            advice += `Rain expected today (${weather.precipitation_sum[0]}mm). Delay irrigation. `;
        } else if (weather && weather.precipitation_sum && weather.precipitation_sum[1] > 5) {
            advice += `Rain expected tomorrow. Consider delaying heavy irrigation. `;
        } else {
            advice += "Irrigation recommended immediately. ";
        }
    } else if (ndwi > 0.1) {
        advice += "💧 High Moisture. ";
        if (ndvi < 0.4) {
            advice += "Possible waterlogging affecting crop health. Check drainage. ";
        } else {
            advice += "Water levels optimal. Do not irrigate. ";
        }
    } else {
        advice += "✅ Optimal Moisture. ";
    }
    
    // Vigor logic
    if (ndvi < 0.3) {
        advice += "🚨 Critical low vigor detected. Inspect sector for pests, disease, or severe nutrient deficiency.";
    } else if (ndvi < 0.5) {
        advice += "⚠️ Moderate vigor. Monitor for emerging stress factors.";
    } else {
        advice += "🌿 Crop health is excellent.";
    }
    
    return advice;
}

async function selectAndAnalyzeSquare(layer) {
    if (selectedGridSquare) {
        selectedGridSquare.setStyle({
            color: '#ffffff', weight: 1, fillColor: selectedGridSquare.baseColor, fillOpacity: 0.6
        });
    }

    selectedGridSquare = layer;
    selectedGridSquare.setStyle({
        color: '#f8fafc', weight: 4, fillOpacity: 0.9 // Highlight thick border
    });

    resultsSection.classList.remove('hidden');
    loadingState.classList.remove('hidden');
    dataState.classList.add('hidden');
    errorState.classList.add('hidden');

    const satData = layer.satData;
    
    // Calculate center for weather
    const coords = layer.geoJsonCoords;
    const centerLng = (coords[0][0] + coords[2][0]) / 2;
    const centerLat = (coords[0][1] + coords[2][1]) / 2;

    const weather = await fetchWeather(centerLat, centerLng);
    
    document.getElementById('ndvi-value').textContent = satData.ndvi !== null ? satData.ndvi.toFixed(3) : "N/A";
    document.getElementById('ndwi-value').textContent = satData.ndwi !== null ? satData.ndwi.toFixed(3) : "N/A";
    
    updateTrend('ndvi', satData.ndvi);
    updateTrend('ndwi', satData.ndwi);
    
    // Display Actionable Advice
    const advice = generateAdvice(satData.ndvi, satData.ndwi, weather);
    
    // Inject advice and weather into UI
    let extraHTML = `
        <div class="metric-card" style="margin-top: 12px; border-color: var(--accent-primary);">
            <div class="metric-header"><h3>💡 Actionable Advice</h3></div>
            <p style="font-size: 14px; margin-top: 8px; line-height: 1.5;">${advice}</p>
        </div>
    `;
    
    if (weather) {
        extraHTML += `
            <div class="coordinates-info">
                <h4>Upcoming Weather</h4>
                <div style="display: flex; gap: 8px;">
                    <div style="background: rgba(0,0,0,0.2); padding: 8px; border-radius: 4px; flex: 1;">
                        <span style="font-size: 11px; color: var(--text-muted);">Today</span><br>
                        🌧️ ${weather.precipitation_sum[0]}mm<br>
                        🌡️ ${weather.temperature_2m_max[0]}°C
                    </div>
                    <div style="background: rgba(0,0,0,0.2); padding: 8px; border-radius: 4px; flex: 1;">
                        <span style="font-size: 11px; color: var(--text-muted);">Tomorrow</span><br>
                        🌧️ ${weather.precipitation_sum[1]}mm<br>
                        🌡️ ${weather.temperature_2m_max[1]}°C
                    </div>
                </div>
            </div>
        `;
    }
    
    const adviceContainer = document.getElementById('advice-container');
    if (adviceContainer) {
        adviceContainer.innerHTML = extraHTML;
    } else {
        const div = document.createElement('div');
        div.id = 'advice-container';
        div.innerHTML = extraHTML;
        dataState.appendChild(div);
    }

    loadingState.classList.add('hidden');
    dataState.classList.remove('hidden');

    const dateFromInput = document.getElementById('date-from');
    const dateToInput = document.getElementById('date-to');
    
    // Set default dates if empty (6 months ago to today)
    if (!dateToInput.value) {
        const today = new Date();
        dateToInput.value = today.toISOString().split('T')[0];
    }
    if (!dateFromInput.value) {
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        dateFromInput.value = sixMonthsAgo.toISOString().split('T')[0];
    }

    // Fetch and render timeseries chart
    fetchAndRenderChart(coords, dateFromInput.value, dateToInput.value);
    
    // Setup update button
    const updateBtn = document.getElementById('update-chart-btn');
    // Remove old listeners by cloning
    const newBtn = updateBtn.cloneNode(true);
    updateBtn.parentNode.replaceChild(newBtn, updateBtn);
    
    newBtn.addEventListener('click', async () => {
        newBtn.disabled = true;
        const originalText = newBtn.textContent;
        newBtn.textContent = 'Loading...';
        
        await fetchAndRenderChart(coords, document.getElementById('date-from').value, document.getElementById('date-to').value);
        
        newBtn.textContent = originalText;
        newBtn.disabled = false;
    });
}

let chartInstance = null;

async function fetchAndRenderChart(coords, startDate, endDate) {
    const chartContainer = document.getElementById('chart-container');
    chartContainer.classList.remove('hidden');
    
    // Show loading text in canvas space
    const ctx = document.getElementById('historyChart').getContext('2d');
    
    try {
        const response = await fetch('http://127.0.0.1:8000/api/timeseries', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ polygons: [coords], start_date: startDate, end_date: endDate })
        });
        
        if (!response.ok) throw new Error("Failed to fetch timeseries");
        const data = await response.json();
        
        const labels = data.timeseries.map(item => item.date);
        const values = data.timeseries.map(item => item.ndvi);
        
        if (chartInstance) {
            chartInstance.destroy();
        }
        
        chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: `NDVI (${startDate} to ${endDate})`,
                    data: values,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 2
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { labels: { color: '#f8fafc' } }
                },
                scales: {
                    x: { ticks: { color: '#9ca3af', maxTicksLimit: 6 }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    y: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.05)' }, min: 0, max: 1 }
                }
            }
        });
        
    } catch (e) {
        console.error("Timeseries error:", e);
    }
}

function updateTrend(metric, value) {
    const trendEl = document.querySelector(`#${metric}-value + .metric-trend`);
    if (value === null) {
        trendEl.className = 'metric-trend neutral'; trendEl.textContent = 'No Data'; return;
    }
    if (metric === 'ndvi') {
        if (value > 0.6) { trendEl.className = 'metric-trend positive'; trendEl.textContent = 'Healthy Vigor'; } 
        else if (value > 0.3) { trendEl.className = 'metric-trend neutral'; trendEl.textContent = 'Moderate Vigor'; } 
        else { trendEl.className = 'metric-trend warning'; trendEl.textContent = 'Low Vigor / Stress'; }
    } else if (metric === 'ndwi') {
        if (value > 0) { trendEl.className = 'metric-trend positive'; trendEl.textContent = 'High Moisture'; } 
        else if (value > -0.1) { trendEl.className = 'metric-trend neutral'; trendEl.textContent = 'Optimal Water'; } 
        else { trendEl.className = 'metric-trend warning'; trendEl.textContent = 'Water Stress'; }
    }
}
