import pandas as pd
import xgboost as xgb
import logging

def main():
    logging.basicConfig(filename='train.log', level=logging.INFO, 
                        format='%(asctime)s - %(message)s')
    
    logging.info("Starting Model B training...")
    print("Training Model B... (logs in train.log)")
    
    X_train = pd.read_csv("data/X_train.csv")
    y_train = pd.read_csv("data/y_train.csv").squeeze()
    
    logging.info(f"Loaded training data. Shape: {X_train.shape}")
    
    logging.info("Training XGBRegressor with max_depth=10, n_estimators=500, learning_rate=0.05...")
    yield_model = xgb.XGBRegressor(objective='reg:squarederror', n_estimators=500, max_depth=10, learning_rate=0.05, tree_method='hist')
    yield_model.fit(X_train, y_train)
    
    yield_model.save_model("model_b_yield_predictor.json")
    logging.info("Saved model_b_yield_predictor.json")
    logging.info("Training completed.")

if __name__ == "__main__":
    main()
