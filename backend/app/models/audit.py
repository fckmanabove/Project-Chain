import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB

from app.core.database import Base


class AuditLog(Base):
    """Журнал событий аудита и слепков изменений для Time Machine."""
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # Инициатор действия (денормализовано, чтобы история не стиралась при удалении юзера)
    user_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    user_email = Column(String(255), nullable=True, index=True)
    user_name = Column(String(255), nullable=True)

    # Целевой объект управления
    entity_type = Column(String(50), nullable=False, index=True)  # 'TASK', 'PROJECT', 'DEPENDENCY', 'USER'
    entity_id = Column(String(100), nullable=False, index=True)
    entity_name = Column(String(255), nullable=True)  # например: "[1.2] Пусконаладка шкафа"

    # Тип операции
    action = Column(String(50), nullable=False, index=True)  # 'CREATE', 'UPDATE', 'DELETE', 'ROLLBACK', 'RESTORE'
    summary = Column(Text, nullable=True)  # Понятное описание: "Срыв срока: финиш сдвинут с 01.09 на 15.09"

    # Слепки данных для Undo / Restore
    before_state = Column(JSONB, nullable=True)  # Состояние до изменения
    after_state = Column(JSONB, nullable=True)   # Состояние после изменения

    is_reverted = Column(Boolean, default=False, nullable=False)  # Был ли выполнен откат этой записи

    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
        nullable=False,
    )