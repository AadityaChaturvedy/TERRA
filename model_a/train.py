import pandas as pd
import xgboost as xgb
import logging

def main():
    logging.basicConfig(filename='train.log', level=logging.INFO, 
                        format='%(asctime)s - %(message)s')
    
    logging.info("Starting Model A training...")
    print("Training Model A... (logs in train.log)")
    
    X_train_balanced = pd.read_csv("data/X_train_balanced.csv")
    y_bin_train_balanced = pd.read_csv("data/y_bin_train_balanced.csv").squeeze()
    
    X_train_reg = pd.read_csv("data/X_train_reg.csv")
    y_str_train = pd.read_csv("data/y_str_train.csv").squeeze()
    
    logging.info(f"Loaded training data. Binary shape: {X_train_balanced.shape}, Reg shape: {X_train_reg.shape}")
    
    # Increased complexity to improve F1 score
    logging.info("Training XGBClassifier with max_depth=10, n_estimators=500, learning_rate=0.05...")
    clf = xgb.XGBClassifier(max_depth=10, learning_rate=0.05, n_estimators=500, tree_method='hist')
    clf.fit(X_train_balanced, y_bin_train_balanced)
    clf.save_model("model_a_health_classifier.json")
    logging.info("Saved model_a_health_classifier.json")
    
    logging.info("Training XGBRegressor with max_depth=10, n_estimators=500, learning_rate=0.05...")
    reg = xgb.XGBRegressor(objective='reg:squarederror', max_depth=10, learning_rate=0.05, n_estimators=500, tree_method='hist')
    reg.fit(X_train_reg, y_str_train)
    reg.save_model("model_a_stress_regressor.json")
    logging.info("Saved model_a_stress_regressor.json")
    logging.info("Training completed.")

if __name__ == "__main__":
    main()
