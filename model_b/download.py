import kagglehub
import shutil
import os

def main():
    print("Downloading Model B dataset...")
    path = kagglehub.dataset_download("atharvasoundankar/smart-farming-sensor-data-for-yield-prediction")
    print(f"Path to dataset files: {path}")
    
    os.makedirs('data', exist_ok=True)
    
    for file in os.listdir(path):
        if file.endswith('.csv'):
            src = os.path.join(path, file)
            dst = os.path.join('data', 'raw.csv')
            shutil.copy(src, dst)
            print(f"Copied {file} to data/raw.csv")
            break

if __name__ == "__main__":
    main()
