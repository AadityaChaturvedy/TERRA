import pandas as pd
import xgboost as xgb
from sklearn.metrics import classification_report

X_train = pd.read_csv("model_a/data/X_train_balanced.csv")
y_train = pd.read_csv("model_a/data/y_bin_train_balanced.csv").squeeze()

clf = xgb.XGBClassifier()
clf.load_model("model_a/model_a_health_classifier.json")
preds = clf.predict(X_train)
print("Train Classification Report:")
print(classification_report(y_train, preds))
