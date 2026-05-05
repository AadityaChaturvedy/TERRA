# TERRA: Satellite + IoT Agricultural Intelligence Platform

TERRA is a low-cost agricultural intelligence platform that leverages satellite remote sensing (via Google Earth Engine) to deliver actionable guidance for farmers. This repository contains the mapping, grid generation, and satellite data extraction components.

## Overview

The core feature of this platform allows users to:
1. Draw freeform agricultural field polygons on a map.
2. Automatically divide the selected field into a 50x50 meter analysis grid.
3. Select individual grid squares to query **Sentinel-2** satellite data in real-time.
4. View metrics like **NDVI** (crop vigor) and **NDWI** (water stress) for localized insights.

## Project Structure

- `frontend/`: Contains the map interface built with Leaflet.js, Turf.js for grid generation, and vanilla HTML/CSS/JS.
- `backend/`: A FastAPI Python server that integrates with Google Earth Engine to process satellite imagery and return the indices.

## Setup & Installation

### 1. Backend (FastAPI & Google Earth Engine)

The backend handles the satellite data processing. It requires a Google Cloud project with the Earth Engine API enabled.

```bash
cd backend

# Create and activate a virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Authenticate Earth Engine
earthengine authenticate
earthengine set_project YOUR_PROJECT_ID

# Run the server
python3 main.py
```
*The server will run on `http://0.0.0.0:8000`.*

> **Note:** If Earth Engine is not authenticated, the backend will gracefully fall back to returning mocked realistic data so the frontend can still be tested and demonstrated.

### 2. Frontend (Map UI)

The frontend does not require a build step.

1. Simply open `frontend/index.html` in your browser.
2. The UI will automatically communicate with the backend running on `localhost:8000`.

## Tech Stack

- **Frontend**: HTML5, CSS3, JavaScript, [Leaflet.js](https://leafletjs.com/) (Mapping), [Turf.js](https://turfjs.org/) (Spatial analysis & grid generation).
- **Backend**: Python, [FastAPI](https://fastapi.tiangolo.com/), [Google Earth Engine API](https://developers.google.com/earth-engine/guides/python_install).
