import pandas as pd
from sklearn.ensemble import RandomForestClassifier
import joblib

# 1. Load dataset (Bạn cần upload file dataset.csv lên Colab)
try:
    data = pd.read_csv('dataset.csv')
    print("Dataset loaded successfully!")
except FileNotFoundError:
    print("Error: dataset.csv not found. Please upload it to Colab.")
    # Tạo dummy data để demo nếu không có file
    data = pd.DataFrame({
        'length': [2, 1, 3, 1, 2, 1],
        'is_sentence_start': [0, 1, 0, 0, 1, 1],
        'has_digit': [0, 0, 0, 1, 0, 0],
        'char_count': [15, 2, 20, 5, 10, 3],
        'label': [1, 0, 1, 0, 1, 0] # 1: Entity, 0: Junk
    })
    print("Using dummy data for demonstration.")

# 2. Prepare features and target
X = data[['length', 'is_sentence_start', 'has_digit', 'char_count']]
y = data['label']

# 3. Train Model
print("Training Random Forest Classifier...")
model = RandomForestClassifier(n_estimators=100, random_state=42)
model.fit(X, y)

# 4. Save Model
model_filename = 'entity_classifier.pkl'
joblib.dump(model, model_filename)
print(f"Model saved as {model_filename}")

# 5. Download instruction
print("\n--- XONG ---")
print(f"Bây giờ hãy tải file {model_filename} về máy và bỏ vào thư mục ai-service/ml/models/")
