import logging
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Tuple
import ee
import random
import time

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="TERRA Earth Engine API")

# Allow CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Earth Engine
EE_INITIALIZED = False
try:
    # This requires local authentication (e.g. `earthengine authenticate`)
    # Or setting up a service account.
    ee.Initialize()
    EE_INITIALIZED = True
    logger.info("Successfully initialized Google Earth Engine.")
except Exception as e:
    logger.warning(f"Failed to initialize Earth Engine: {str(e)}")
    logger.warning("Will use mock data for demonstrations.")

class RegionRequest(BaseModel):
    # List of [longitude, latitude] coordinates
    coordinates: List[Tuple[float, float]]

class GridRequest(BaseModel):
    # List of polygons, where each polygon is a list of [longitude, latitude]
    polygons: List[List[Tuple[float, float]]]

@app.post("/api/analyze-grid")
async def analyze_grid(request: GridRequest):
    if not request.polygons:
        raise HTTPException(status_code=400, detail="No polygons provided.")
        
    logger.info(f"Received request to analyze grid with {len(request.polygons)} squares.")
    
    if not EE_INITIALIZED:
        logger.info("Returning mocked data for grid.")
        time.sleep(1.5)
        results = []
        for i in range(len(request.polygons)):
            results.append({
                "id": i,
                "ndvi": random.uniform(0.3, 0.8),
                "ndwi": random.uniform(-0.1, 0.25)
            })
        return {"status": "success", "mocked": True, "results": results}

    try:
        # Create ee.FeatureCollection
        features = []
        for i, coords in enumerate(request.polygons):
            # Ensure closed ring
            c = coords.copy()
            if c[0] != c[-1]:
                c.append(c[0])
            geom = ee.Geometry.Polygon([c])
            features.append(ee.Feature(geom, {'id': i}))
            
        fc = ee.FeatureCollection(features)
        
        # Date range
        end_date = ee.Date(time.time() * 1000)
        start_date = end_date.advance(-30, 'day')
        
        # Get imagery
        s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED') \
            .filterBounds(fc.geometry()) \
            .filterDate(start_date, end_date) \
            .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
            
        if s2.size().getInfo() == 0:
            raise HTTPException(status_code=404, detail="No suitable satellite imagery found.")
            
        image = s2.sort('system:time_start', False).first()
        
        ndvi = image.normalizedDifference(['B8', 'B4']).rename('NDVI')
        ndwi = image.normalizedDifference(['B3', 'B8']).rename('NDWI')
        
        # Combine bands to reduce together
        combined = ndvi.addBands(ndwi)
        
        # Reduce regions
        reduced = combined.reduceRegions(
            collection=fc,
            reducer=ee.Reducer.mean(),
            scale=10,
            crs='EPSG:4326'
        )
        
        reduced_info = reduced.getInfo()
        
        results = []
        for feature in reduced_info['features']:
            props = feature['properties']
            results.append({
                "id": props.get('id'),
                "ndvi": props.get('NDVI', None),
                "ndwi": props.get('NDWI', None)
            })
            
        # Sort results back into original order
        results.sort(key=lambda x: x['id'])
        
        return {"status": "success", "mocked": False, "results": results}
        
    except Exception as e:
        logger.error(f"Error during GEE grid processing: {str(e)}")
        # Mock fallback
        results = []
        for i in range(len(request.polygons)):
            results.append({
                "id": i,
                "ndvi": random.uniform(0.3, 0.8),
                "ndwi": random.uniform(-0.1, 0.25)
            })
        return {"status": "error", "mocked": True, "results": results, "message": str(e)}

@app.post("/api/analyze-region")
async def analyze_region(request: RegionRequest):
    if len(request.coordinates) < 3:
        raise HTTPException(status_code=400, detail="At least 3 coordinates must be provided to define a polygon.")

    logger.info(f"Received request to analyze tile with coordinates: {request.coordinates}")

    if not EE_INITIALIZED:
        # Return mock data if GEE is not configured
        logger.info("Returning mocked data.")
        # Simulate network/processing delay
        time.sleep(1.5)
        
        # Generate realistic looking mock data
        # Let's say NDVI is between 0.2 and 0.8
        mock_ndvi = random.uniform(0.3, 0.8)
        # NDWI between -0.2 and 0.3
        mock_ndwi = random.uniform(-0.1, 0.25)
        
        return {
            "status": "success",
            "mocked": True,
            "ndvi": mock_ndvi,
            "ndwi": mock_ndwi,
            "message": "Returned mock data because Earth Engine is not authenticated."
        }

    # Actual GEE processing
    try:
        # Create a polygon geometry
        # ee.Geometry.Polygon expects a list of rings. A ring is a list of coordinates.
        # We need to close the polygon by repeating the first coordinate at the end.
        coords = request.coordinates.copy()
        coords.append(coords[0])
        roi = ee.Geometry.Polygon([coords])

        # Define date range (e.g., last 30 days)
        # In a real app, this would be dynamic.
        end_date = ee.Date(time.time() * 1000) # Current time
        start_date = end_date.advance(-30, 'day')

        # Get Sentinel-2 Surface Reflectance collection
        s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED') \
            .filterBounds(roi) \
            .filterDate(start_date, end_date) \
            .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))

        if s2.size().getInfo() == 0:
            raise HTTPException(status_code=404, detail="No suitable satellite imagery found for this region and time period.")

        # Get the most recent image
        image = s2.sort('system:time_start', False).first()

        # Compute NDVI: (NIR - Red) / (NIR + Red) -> (B8 - B4) / (B8 + B4)
        ndvi = image.normalizedDifference(['B8', 'B4']).rename('NDVI')
        
        # Compute NDWI: (Green - NIR) / (Green + NIR) -> (B3 - B8) / (B3 + B8)
        # Note: NDWI definition can vary, sometimes it's (NIR - SWIR)/(NIR + SWIR). 
        # Using Green-NIR for water body/moisture mapping here.
        ndwi = image.normalizedDifference(['B3', 'B8']).rename('NDWI')

        # Reduce region to get mean values
        ndvi_mean = ndvi.reduceRegion(
            reducer=ee.Reducer.mean(),
            geometry=roi,
            scale=10, # Sentinel-2 resolution is 10m
            maxPixels=1e9
        ).get('NDVI').getInfo()

        ndwi_mean = ndwi.reduceRegion(
            reducer=ee.Reducer.mean(),
            geometry=roi,
            scale=10,
            maxPixels=1e9
        ).get('NDWI').getInfo()

        return {
            "status": "success",
            "mocked": False,
            "ndvi": ndvi_mean,
            "ndwi": ndwi_mean
        }

    except Exception as e:
        logger.error(f"Error during GEE processing: {str(e)}")
        # Fallback to mock data if GEE fails (e.g. quota limits)
        return {
            "status": "error",
            "mocked": True,
            "ndvi": random.uniform(0.3, 0.8),
            "ndwi": random.uniform(-0.1, 0.25),
            "message": f"GEE processing failed: {str(e)}. Returning mock data."
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
