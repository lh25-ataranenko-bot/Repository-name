from datetime import UTC, datetime, timedelta

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from .config import get_settings
from .db import get_db
from .models import User
from .services.cache import Counter

bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:
        return False


def create_token(user: User) -> str:
    s = get_settings()
    payload = {"sub": str(user.id), "role": user.role, "ver": user.token_version,
               "exp": datetime.now(UTC) + timedelta(minutes=s.jwt_ttl_minutes)}
    return jwt.encode(payload, s.jwt_secret, algorithm="HS256")


def current_user(
    cred: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)
) -> User:
    if cred is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Увійдіть в обліковий запис")
    try:
        payload = jwt.decode(cred.credentials, get_settings().jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Сесія завершилася. Увійдіть знову") from None
    user = db.get(User, int(payload["sub"]))
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Користувача не знайдено")
    if payload.get("ver", 0) != user.token_version:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Пароль змінено. Увійдіть знову")
    return user


def require_editor(user: User = Depends(current_user)) -> User:
    if user.role not in ("editor", "admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Потрібні права редактора")
    return user


def require_admin(user: User = Depends(current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Потрібні права адміністратора")
    return user


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Per-IP requests per minute. With AUTOWISE_REDIS_URL the limit is shared by all API instances."""

    def __init__(self, app, per_minute: int, trust_forwarded_for: bool = False):
        super().__init__(app)
        self.per_minute = per_minute
        self.trust_forwarded_for = trust_forwarded_for
        self.counter = Counter("rate", 60)

    async def dispatch(self, request: Request, call_next):
        if request.url.path.startswith("/api/") and not request.url.path.startswith("/api/media/"):
            ip = request.client.host if request.client else "unknown"
            fwd = request.headers.get("x-forwarded-for")
            if self.trust_forwarded_for and fwd:
                ip = fwd.split(",")[0].strip()
            if self.counter.hit(ip) > self.per_minute:
                return JSONResponse({"detail": "Забагато запитів. Спробуйте за хвилину."}, status_code=429)
        return await call_next(request)


class LoginGuard:
    """Blocks an email after too many failed logins in 15 minutes (brute-force protection)."""

    def __init__(self) -> None:
        self.counter = Counter("login-fail", 15 * 60)

    def check(self, email: str) -> None:
        if self.counter.count(email) >= get_settings().login_attempts_per_15min:
            raise HTTPException(429, "Забагато невдалих спроб входу. Спробуйте через 15 хвилин або відновіть пароль.")

    def failed(self, email: str) -> None:
        self.counter.hit(email)

    def succeeded(self, email: str) -> None:
        self.counter.reset(email)


login_guard = LoginGuard()
