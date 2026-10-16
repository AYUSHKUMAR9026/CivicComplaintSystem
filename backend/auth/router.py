from datetime import timedelta
from sqlalchemy import or_
from sqlalchemy.orm import Session
from sqlalchemy import or_
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError

from db.session import get_db
from models import User, Citizen, Admin, UserRole
from schemas import UserCreate, UserLogin, UserResponse, Token, CitizenProfile, AdminProfile, ProfileUpdateRequest
from common.auth import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    get_current_active_user,
    require_admin
)
from common.exceptions import ValidationException, ConflictException, UnauthorizedException
from common.geo import geocode_address

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=Token)
async def register(
    user_data: UserCreate,
    citizen_profile: CitizenProfile = None,
    admin_profile: AdminProfile = None,
    db: Session = Depends(get_db)
):
    """Register a new user (citizen or admin)"""
    # Check if user exists. Phone is optional, and comparing it to None builds
    # "phone IS NULL", which matches every seeded department account and fails a
    # brand-new email, so only match on a phone the caller actually supplied.
    identifiers = [User.email == user_data.email]
    if user_data.phone:
        identifiers.append(User.phone == user_data.phone)
    existing = db.query(User).filter(or_(*identifiers)).first()
    if existing:
        raise ConflictException("User with this email or phone already exists")
    
    # Create user
    hashed_password = get_password_hash(user_data.password)
    user = User(
        email=user_data.email,
        phone=user_data.phone,
        password_hash=hashed_password,
        full_name=user_data.full_name,
        role=user_data.role
    )
    db.add(user)
    db.flush()
    
    # Create role-specific profile
    if user_data.role == UserRole.CITIZEN:
        addr = citizen_profile.address if citizen_profile else None
        lat = citizen_profile.latitude if citizen_profile else None
        lon = citizen_profile.longitude if citizen_profile else None
        if addr and (lat is None or lon is None):
            coords = geocode_address(addr)
            if coords:
                lat, lon = coords
        profile = Citizen(
            user_id=user.id,
            address=addr,
            latitude=lat,
            longitude=lon,
            preferred_notification_channels=citizen_profile.preferred_notification_channels if citizen_profile else "email,push"
        )
        db.add(profile)
    elif user_data.role in [UserRole.ADMIN, UserRole.DEPARTMENT]:
        profile = Admin(
            user_id=user.id,
            department_id=admin_profile.department_id if admin_profile else None,
            permissions=admin_profile.permissions if admin_profile else "all"
        )
        db.add(profile)
    
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise ConflictException("Registration failed")
    
    # Create tokens
    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role.value}
    )
    refresh_token = create_refresh_token(
        data={"sub": str(user.id), "role": user.role.value}
    )
    
    return Token(
        access_token=access_token,
        refresh_token=refresh_token
    )


@router.post("/login", response_model=Token)
async def login(
    credentials: UserLogin,
    db: Session = Depends(get_db)
):
    """User login"""
    user = db.query(User).filter(User.email == credentials.email).first()
    
    if not user or not verify_password(credentials.password, user.password_hash):
        raise UnauthorizedException("Invalid email or password")
    
    if not user.is_active:
        raise UnauthorizedException("Account is deactivated")
    
    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role.value}
    )
    refresh_token = create_refresh_token(
        data={"sub": str(user.id), "role": user.role.value}
    )
    
    return Token(
        access_token=access_token,
        refresh_token=refresh_token
    )


@router.post("/refresh", response_model=Token)
async def refresh_token(
    refresh_token: str,
    db: Session = Depends(get_db)
):
    """Refresh access token using refresh token"""
    from common.auth import decode_token
    
    token_data = decode_token(refresh_token)
    if not token_data or token_data.user_id is None:
        raise UnauthorizedException("Invalid refresh token")
    
    user = db.query(User).filter(User.id == token_data.user_id).first()
    if not user or not user.is_active:
        raise UnauthorizedException("User not found or inactive")
    
    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role.value}
    )
    new_refresh_token = create_refresh_token(
        data={"sub": str(user.id), "role": user.role.value}
    )
    
    return Token(
        access_token=access_token,
        refresh_token=new_refresh_token
    )


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_active_user)
):
    """Get current user profile"""
    return current_user


@router.put("/me", response_model=UserResponse)
@router.put("/profile", response_model=UserResponse)
async def update_profile(
    profile_data: ProfileUpdateRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Update current user profile including location coordinates."""
    if profile_data.full_name is not None and profile_data.full_name.strip():
        current_user.full_name = profile_data.full_name.strip()
    if profile_data.phone is not None and profile_data.phone.strip():
        phone = profile_data.phone.strip()
        existing = db.query(User).filter(User.phone == phone, User.id != current_user.id).first()
        if existing:
            raise ConflictException("Phone number already in use")
        current_user.phone = phone

    if current_user.role == UserRole.CITIZEN:
        citizen = db.query(Citizen).filter(Citizen.user_id == current_user.id).first()
        if not citizen:
            citizen = Citizen(user_id=current_user.id)
            db.add(citizen)
            db.flush()

        lat = profile_data.latitude
        lon = profile_data.longitude
        addr = profile_data.address

        if addr is not None:
            citizen.address = addr.strip() if addr.strip() else None

        # Validate or geocode coordinates
        if lat is not None or lon is not None:
            if lat is None or lon is None:
                raise ValidationException("Both latitude and longitude must be provided for geographic positioning.")
            if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
                raise ValidationException("Coordinates out of range. Latitude must be between -90 and 90, longitude between -180 and 180.")
            citizen.latitude = float(lat)
            citizen.longitude = float(lon)
        elif addr and addr.strip() and (citizen.latitude is None or citizen.longitude is None):
            coords = geocode_address(addr)
            if coords:
                citizen.latitude, citizen.longitude = coords

    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/logout")
async def logout():
    """Logout (client-side token removal)"""
    return {"message": "Logged out successfully"}
