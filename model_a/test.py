import pandas as pd
import xgboost as xgb
from sklearn.metrics import classification_report, mean_squared_error

def main():
    print("Evaluating Model A...")
    X_test = pd.read_csv("data/X_test.csv")
    y_bin_test = pd.read_csv("data/y_bin_test.csv").squeeze()
    y_str_test = pd.read_csv("data/y_str_test.csv").squeeze()
    
    clf = xgb.XGBClassifier()
    clf.load_model("model_a_health_classifier.json")
    
    y_bin_pred = clf.predict(X_test)
    print("Classification Report:\n", classification_report(y_bin_test, y_bin_pred))
    
    reg = xgb.XGBRegressor()
    reg.load_model("model_a_stress_regressor.json")
    
    y_str_pred = reg.predict(X_test)
    print("RMSE for Stress Indicator:", mean_squared_error(y_str_test, y_str_pred) ** 0.5)

if __name__ == "__main__":
    main()
