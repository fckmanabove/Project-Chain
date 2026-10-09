"""
WebSocket Connection Manager and Realtime Collaboration Hub.
"""

from typing import Dict, List, Optional
from uuid import UUID
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, status

from app.core.security import decode_token
from app.core.security_redis import is_token_blacklisted

ws_router = APIRouter(tags=["WebSockets"])


class ProjectConnectionManager:
    """
    Управляет активными WebSocket-соединениями, сгруппированными по проектам.
    """

    def __init__(self):
        # project_id (str) -> List[WebSocket]
        self.active_rooms: Dict[str, List[WebSocket]] = {}

    async def connect(self, project_id: str, websocket: WebSocket):
        await websocket.accept()
        if project_id not in self.active_rooms:
            self.active_rooms[project_id] = []
        self.active_rooms[project_id].append(websocket)

    def disconnect(self, project_id: str, websocket: WebSocket):
        if project_id in self.active_rooms:
            if websocket in self.active_rooms[project_id]:
                self.active_rooms[project_id].remove(websocket)
            if not self.active_rooms[project_id]:
                del self.active_rooms[project_id]

    async def broadcast_to_project(self, project_id: str, event_type: str, data: dict):
        """
        Отправляет JSON-сообщение всем клиентам, просматривающим данный проект.
        """
        if project_id in self.active_rooms:
            payload = json.dumps({"event": event_type, "data": data})
            # Создаем копию списка на случай отключения клиента во время итерации
            for connection in list(self.active_rooms[project_id]):
                try:
                    await connection.send_text(payload)
                except Exception:
                    self.disconnect(project_id, connection)


manager = ProjectConnectionManager()


@ws_router.websocket("/ws/projects/{project_id}")
async def project_websocket_endpoint(
    websocket: WebSocket,
    project_id: UUID,
    token: Optional[str] = Query(default=None),
):
    """
    WebSocket эндпоинт для совместной работы в реальном времени над графиком Гантта.
    """
    auth_header = websocket.headers.get("authorization")
    if not token and auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]

    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Missing token")
        return

    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise ValueError("Invalid token type")
        jti = payload.get("jti")
        if jti and await is_token_blacklisted(jti):
            raise ValueError("Token blacklisted")
    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Unauthorized")
        return

    proj_id_str = str(project_id)
    await manager.connect(proj_id_str, websocket)

    try:
        while True:
            # Слушаем входящие события от клиента (heartbeat, ручные lock-сигналы)
            raw_data = await websocket.receive_text()
            try:
                message = json.loads(raw_data)
                event_type = message.get("event", "PING")
                event_data = message.get("data", {})

                # Ретранслируем событие остальным участникам комнаты
                if event_type in ("TASK_LOCK_CHANGE", "USER_ACTION", "CURSOR_MOVE"):
                    await manager.broadcast_to_project(proj_id_str, event_type, event_data)
                elif event_type == "PING":
                    await websocket.send_text(json.dumps({"event": "PONG"}))
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        manager.disconnect(proj_id_str, websocket)