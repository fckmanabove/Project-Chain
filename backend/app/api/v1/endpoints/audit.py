import uuid
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_permission
from app.models.audit import AuditLog
from app.models.auth import User
from app.services.rollback_service import RollbackService

router = APIRouter()


@router.get("/logs")
async def get_audit_logs(
    entity_type: Optional[str] = None,
    action: Optional[str] = None,
    user_email: Optional[str] = None,
    limit: int = Query(100, le=500),
    offset: int = 0,
    group_by: Optional[str] = Query(None, description="'date' или 'user'"),
    current_user: User = Depends(require_permission("audit:view")),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(AuditLog).order_by(desc(AuditLog.created_at))
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type.upper())
    if action:
        stmt = stmt.where(AuditLog.action == action.upper())
    if user_email:
        stmt = stmt.where(AuditLog.user_email == user_email.lower().strip())

    stmt = stmt.limit(limit).offset(offset)
    res = await db.execute(stmt)
    logs = res.scalars().all()

    items = [
        {
            "id": str(log.id),
            "user_id": str(log.user_id) if log.user_id else None,
            "user_email": log.user_email,
            "user_name": log.user_name,
            "entity_type": log.entity_type,
            "entity_id": log.entity_id,
            "entity_name": log.entity_name,
            "action": log.action,
            "summary": log.summary,
            "before_state": log.before_state,
            "after_state": log.after_state,
            "is_reverted": log.is_reverted,
            "created_at": log.created_at.isoformat(),
        }
        for log in logs
    ]

    if group_by == "date":
        grouped: Dict[str, List[Dict[str, Any]]] = {}
        for it in items:
            d_key = it["created_at"].split("T")[0]
            grouped.setdefault(d_key, []).append(it)
        return {"mode": "by_date", "total": len(items), "groups": grouped}

    if group_by == "user":
        grouped: Dict[str, List[Dict[str, Any]]] = {}
        for it in items:
            u_key = it["user_email"] or "Система"
            grouped.setdefault(u_key, []).append(it)
        return {"mode": "by_user", "total": len(items), "groups": grouped}

    return {"mode": "flat", "total": len(items), "items": items}


@router.get("/trash")
async def get_trash_bin(
    current_user: User = Depends(require_permission("audit:view")),
    db: AsyncSession = Depends(get_db),
):
    """Возвращает удаленные сущности для Корзины (Undelete)."""
    stmt = (
        select(AuditLog)
        .where(AuditLog.action == "DELETE", AuditLog.is_reverted == False)
        .order_by(desc(AuditLog.created_at))
    )
    res = await db.execute(stmt)
    logs = res.scalars().all()
    return [
        {
            "log_id": str(log.id),
            "entity_type": log.entity_type,
            "entity_id": log.entity_id,
            "entity_name": log.entity_name,
            "deleted_by": log.user_name or log.user_email,
            "deleted_at": log.created_at.isoformat(),
            "snapshot": log.before_state,
        }
        for log in logs
    ]


@router.post("/rollback/{log_id}")
async def rollback_action(
    log_id: uuid.UUID,
    current_user: User = Depends(require_permission("audit:rollback")),
    db: AsyncSession = Depends(get_db),
):
    """1-клик откат действия Time Machine."""
    return await RollbackService.rollback_log(db=db, log_id=log_id, user=current_user)