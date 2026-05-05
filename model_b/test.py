import pandas as pd
import xgboost as xgb
from sklearn.metrics import mean_squared_error

def main():
    print("Evaluating Model B...")
    X_test = pd.read_csv("data/X_test.csv")
    y_test = pd.read_csv("data/y_test.csv").squeeze()
    
    yield_model = xgb.XGBRegressor()
    yield_model.load_model("model_b_yield_predictor.json")
    
    yield_preds = yield_model.predict(X_test)
    print("Yield RMSE:", mean_squared_error(y_test, yield_preds) ** 0.5)

if __name__ == "__main__":
    main()
