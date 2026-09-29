"""
API v1 Router Aggregator.
"""

from fastapi import APIRouter
from app.api.v1.projects import router as projects_router
from app.api.v1.tasks import router as tasks_router
from app.api.v1.ws import ws_router
from app.api.v1.analytics import router as analytics_router

from app.api.v1.endpoints import auth, audit, admin, users, diary

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(audit.router, prefix="/audit", tags=["audit"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(diary.router, tags=["diary"])
api_router.include_router(projects_router)
api_router.include_router(tasks_router)
api_router.include_router(analytics_router)
api_router.include_router(ws_router)