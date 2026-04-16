from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from loguru import logger
import os

app = FastAPI(title="A2 Eventos - Face Service (skeleton)")

class ExtractRequest(BaseModel):
    image_base64: str

@app.get("/health")
def health():
    return {"status": "healthy", "engine": "mock", "use_gpu": os.environ.get('FACE_USE_GPU', 'false')}

@app.post("/api/extract")
def extract(req: ExtractRequest):
    try:
        if not req.image_base64:
            raise HTTPException(status_code=400, detail="image_base64 required")
        # Retorna embedding mock — substitua por inferência ONNX/InsightFace
        embedding = [0.0] * 512
        return {"success": True, "mock": True, "embedding": embedding}
    except Exception as e:
        logger.error("extract error: {}", e)
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get('PORT', 8000)))
