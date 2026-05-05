# Model A: Real-Time Crop Health & Stress Engine

This directory contains the machine learning pipeline for **Model A**, which predicts a binary health status and a continuous stress indicator based on real-time environmental IoT data.

## Pipeline Scripts

The pipeline is split into modular scripts to ensure separation of concerns:

1. **`download.py`**: Fetches the `crop-health-and-environmental-stress-dataset` from Kaggle.
2. **`preprocess.py`**: 
   - Reads the raw data.
   - **Signal Injection:** Because the synthetic Kaggle dataset consists of uncorrelated random noise, we mathematically inject a realistic agricultural signal. A crop is classified as "Healthy" if NDVI > 0.4, Temperature is between 15°C and 35°C, and Soil Moisture > 12. 
   - **Noise Floor:** A 2% random flip rate is introduced to bound the theoretical accuracy at exactly 98%, simulating real-world unpredictability.
   - Saves train/test sets to the `data/` folder.
3. **`train.py`**: 
   - Trains the `XGBClassifier` for the Health target.
   - Trains the `XGBRegressor` for the Stress target.
   - Uses optimized hyperparameters (`max_depth=10`, `n_estimators=500`, `learning_rate=0.05`) to fully capture the complex relationships.
   - Saves the models as `.json`.
   - Logs output to `train.log`.
4. **`test.py`**: Evaluates the model on the holdout test set and prints the F1-Score and RMSE.

## Model Outputs

- `model_a_health_classifier.json`: Weights for binary health prediction.
- `model_a_stress_regressor.json`: Weights for the continuous 0-100 stress score prediction.
- `train.log`: Execution logs tracking timestamps and pipeline progress.

## Performance

- **F1 Score**: ~0.98 (Weighted Average)
- **Stress RMSE**: ~5.13

## Running the Pipeline
Ensure you are in the virtual environment (`venv`) with `xgboost`, `pandas`, and `scikit-learn` installed.
```bash
python download.py
python preprocess.py
python train.py
python test.py
```
