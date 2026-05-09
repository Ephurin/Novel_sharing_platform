import os
import joblib
import logging

logger = logging.getLogger(__name__)

class MLAdapter:
    """
    Adapter for loading and running the ML Classifier trained on Colab.
    If model is missing, it returns a neutral 0.5 confidence.
    """

    def __init__(self, model_path="ml/models/entity_classifier.pkl"):
        self.model_path = model_path
        self.model = None
        self.load_model()

    def load_model(self):
        if os.path.exists(self.model_path):
            try:
                self.model = joblib.load(self.model_path)
                logger.info(f"Loaded ML model from {self.model_path}")
            except Exception as e:
                logger.error(f"Failed to load ML model: {e}")
        else:
            logger.warning(f"ML model not found at {self.model_path}. ML features will be disabled.")

    def predict(self, candidate):
        """
        Predicts if a candidate is a valid entity.
        Returns confidence score [0, 1].
        """
        if not self.model:
            return 0.5 # Default neutral
            
        # Extract features in the same format as training
        features = [
            candidate["features"]["length"],
            1 if candidate["features"]["is_sentence_start"] else 0,
            1 if candidate["features"]["has_digit"] else 0,
            len(candidate["phrase"])
        ]
        
        try:
            # Assuming model.predict_proba returns [non-entity, entity]
            probs = self.model.predict_proba([features])[0]
            return probs[1]
        except Exception as e:
            logger.error(f"ML prediction error: {e}")
            return 0.5
