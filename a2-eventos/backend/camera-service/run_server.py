import sys
sys.path.insert(0, 'src')
from video_server import app
import uvicorn
uvicorn.run(app, host='127.0.0.1', port=8000)