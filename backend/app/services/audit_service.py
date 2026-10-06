import uuid
from datetime import date, datetime
from enum import Enum
from typing import Any, Dict, Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.audit import AuditLog
from app.models.auth import User


def serialize_val(val: Any) -> Any:
    """Приводит типы SQLAlchemy к чистому JSON-сериализуемому виду."""
    if isinstance(val, (datetime, date)):
        return val.isoformat()
    if isinstance(val, uuid.UUID):
        return str(val)
    if isinstance(val, Enum):
        return val.value
    if isinstance(val, dict):
        return {k: serialize_val(v) for k, v in val.items()}
    if isinstance(val, (list, tuple, set)):
        return [serialize_val(v) for v in val]
    return val


def extract_model_snapshot(instance: Any, exclude: Optional[set] = None) -> Dict[str, Any]:
    """Снимает чистый словарь-слепок полей SQLAlchemy-модели."""
    exclude = exclude or {"created_at", "updated_at"}
    snapshot = {}
    for col in instance.__table__.columns:
        if col.name not in exclude:
            val = getattr(instance, col.name, None)
            snapshot[col.name] = serialize_val(val)
    return snapshot


def generate_diff_summary(before: Dict[str, Any], after: Dict[str, Any]) -> Tuple[Dict[str, Any], Dict[str, Any], str]:
    """Вычисляет дельту измененных атрибутов и формирует читаемую сводку."""
    diff_before = {}
    diff_after = {}
    changed_items = []

    all_keys = set(before.keys()) | set(after.keys())
    for k in sorted(all_keys):
        v_before = before.get(k)
        v_after = after.get(k)
        if v_before != v_after:
            diff_before[k] = v_before
            diff_after[k] = v_after
            changed_items.append(f"{k}: {v_before} ➔ {v_after}")

    summary = "; ".join(changed_items) if changed_items else "Без изменения ключевых атрибутов"
    return diff_before, diff_after, summary


class AuditService:
    """Сервис фиксации слепков состояния и событий в журнале Time Machine."""

    @staticmethod
    async def record_action(
        db: AsyncSession,
        entity_type: str,
        entity_id: str,
        action: str,
        user: Optional[User] = None,
        entity_name: Optional[str] = None,
        summary: Optional[str] = None,
        before_state: Optional[Dict[str, Any]] = None,
        after_state: Optional[Dict[str, Any]] = None,
    ) -> AuditLog:
        log_entry = AuditLog(
            user_id=user.id if user else None,
            user_email=user.email if user else "system@prochain.internal",
            user_name=user.full_name if user else "Системный процесс",
            entity_type=entity_type.upper(),
            entity_id=str(entity_id),
            entity_name=entity_name,
            action=action.upper(),
            summary=summary,
            before_state=before_state,
            after_state=after_state,
        )
        db.add(log_entry)
        await db.flush()
        return log_entry