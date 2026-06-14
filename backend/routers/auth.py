from fastapi import APIRouter, HTTPException, status, Depends
from models.schemas import UserLogin, TokenResponse
from services.auth_service import authenticate_user, create_access_token, get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(body: UserLogin):
    user = authenticate_user(body.username, body.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )
    token = create_access_token({"sub": user["id"], "username": user["username"]})
    return TokenResponse(
        access_token=token,
        user_id=user["id"],
        username=user["username"],
    )


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return user
