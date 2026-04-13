import numpy as np
from scipy.spatial import distance as dist
import logging

logger = logging.getLogger(__name__)

class LivenessDetector:
    def __init__(self, ear_threshold=0.2, consecutive_frames=3):
        """
        ear_threshold: Threshold below which eyes are considered closed.
        consecutive_frames: Number of consecutive frames eyes must be closed to count as a blink.
        """
        self.ear_threshold = ear_threshold
        self.consecutive_frames = consecutive_frames
        
        # State per camera
        self.camera_states = {}

    def _calculate_ear(self, eye_points):
        """Calculates Eye Aspect Ratio (EAR)"""
        # Vertical distances
        A = dist.euclidean(eye_points[1], eye_points[5])
        B = dist.euclidean(eye_points[2], eye_points[4])
        # Horizontal distance
        C = dist.euclidean(eye_points[0], eye_points[3])
        
        ear = (A + B) / (2.0 * C)
        return ear

    def check_liveness(self, camera_id, face_landmarks):
        """
        Check for blink activity.
        face_landmarks: dictionary from face_recognition.face_landmarks
        """
        if 'left_eye' not in face_landmarks or 'right_eye' not in face_landmarks:
            return False, 0.0

        left_ear = self._calculate_ear(face_landmarks['left_eye'])
        right_ear = self._calculate_ear(face_landmarks['right_eye'])
        avg_ear = (left_ear + right_ear) / 2.0

        if camera_id not in self.camera_states:
            self.camera_states[camera_id] = {
                'blink_count': 0,
                'counter': 0,
                'last_ear': avg_ear,
                'is_live': False
            }

        state = self.camera_states[camera_id]
        
        # Blink detection logic
        if avg_ear < self.ear_threshold:
            state['counter'] += 1
        else:
            if state['counter'] >= self.consecutive_frames:
                state['blink_count'] += 1
                logger.info(f"👁️ Blink detectado na cam {camera_id}! Total: {state['blink_count']}")
                state['is_live'] = True
            state['counter'] = 0

        state['last_ear'] = avg_ear
        
        # For simplicity, if we saw at least one blink, we consider it live for a while
        # In a real high-security system, we might require a blink within the last X seconds.
        return state['is_live'], avg_ear

    def reset_status(self, camera_id):
        if camera_id in self.camera_states:
            self.camera_states[camera_id]['is_live'] = False
            self.camera_states[camera_id]['blink_count'] = 0
