from fastapi import APIRouter, HTTPException
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/health")
async def health():
    return {"status": "healthy"}

@router.get("/stats")
async def stats():
    return {"message": "Stats endpoint"}