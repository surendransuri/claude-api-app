import os
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

SECRET_KEY = os.getenv("JWT_SECRET", "change-this-secret")
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "10080"))
DEV_MODE = os.getenv("DEV_MODE", "false").lower() == "true"

DEMO_USERNAME = os.getenv("DEMO_USERNAME", "admin")
DEMO_EMAIL = os.getenv("DEMO_EMAIL", "admin@nexchat.local")
DEMO_PASSWORD = os.getenv("DEMO_PASSWORD", "nexchat123")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer(auto_error=False)

# Hashed demo password generated at startup
_demo_password_hash = pwd_context.hash(DEMO_PASSWORD)

DEMO_USERS = {
    DEMO_USERNAME: {
        "id": "demo-user-001",
        "username": DEMO_USERNAME,
        "email": DEMO_EMAIL,
        "password_hash": _demo_password_hash,
    }
}


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def authenticate_user(username: str, password: str) -> Optional[dict]:
    user = DEMO_USERS.get(username)
    if not user:
        return None
    if not verify_password(password, user["password_hash"]):
        return None
    return user


def create_access_token(data: dict) -> str:
    payload = data.copy()
    payload["exp"] = datetime.utcnow() + timedelta(minutes=EXPIRE_MINUTES)
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> dict:
    if DEV_MODE:
        return {"user_id": DEMO_USERS[DEMO_USERNAME]["id"], "username": DEMO_USERNAME}
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = decode_token(credentials.credentials)
    user_id = payload.get("sub")
    username = payload.get("username")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    return {"user_id": user_id, "username": username}
