import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from app.core.database import Base


class Role(Base):
    """Роль пользователя в системе с гранулярной матрицей прав (RBAC)."""
    __tablename__ = "roles"

    id = Column(String(50), primary_key=True)  # 'SUPERADMIN', 'PM', 'GIP', etc.
    name = Column(String(100), nullable=False)
    description = Column(String(255), nullable=True)
    # Матрица прав: ["projects:delete", "tasks:edit_dates", "baseline:freeze", ...]
    permissions = Column(JSONB, default=list, nullable=False)
    is_system = Column(Boolean, default=False, nullable=False)

    users = relationship("User", back_populates="role")


class User(Base):
    """Учетная запись сотрудника предприятия."""
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    position = Column(String(255), nullable=True)  # "ГИП", "Инженер АСУ ТП"
    
    role_id = Column(String(50), ForeignKey("roles.id"), nullable=False, default="PM")
    role = relationship("Role", back_populates="users", lazy="joined")
    
    # Персональные исключения прав поверх роли: {"allow": [...], "deny": [...]}
    custom_permissions = Column(JSONB, default=dict, nullable=False)
    
    is_active = Column(Boolean, default=True, nullable=False)
    is_verified = Column(Boolean, default=False, nullable=False)  # 2FA OTP подтвержден
    totp_secret = Column(String(64), nullable=True)
    two_factor_method = Column(String(30), default="EMAIL_OTP", nullable=False)
    theme = Column(String(20), default="dark", nullable=False)  # 'dark' | 'light'
    
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))