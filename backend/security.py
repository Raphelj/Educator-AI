import os
from datetime import datetime, timedelta
from jose import jwt
import bcrypt

# 1. JWT Configuration Variables
# SECRET_KEY is the master lock that signs our tokens. If anyone steals this, they can forge logins.
# In production, this MUST be in your .env file.
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "super-secret-development-key-please-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30


# --- Functions ---

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Takes a plain text password (e.g., from a login form) and compares it against
    the scrambled hash in the database. Returns True if they match.
    """
    try:
        pwd_bytes = plain_password.encode('utf-8')[:72]
        hash_bytes = hashed_password.encode('utf-8')
        return bcrypt.checkpw(pwd_bytes, hash_bytes)
    except Exception:
        return False


def get_password_hash(password: str) -> str:
    """
    Takes a plain text password (e.g., from a signup form) and cryptographically
    scrambles it using native bcrypt.
    """
    pwd_bytes = password.encode('utf-8')[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode('utf-8')


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """
    Generates the JWT (JSON Web Token) that acts as the user's digital ID badge.
    The 'data' dictionary usually contains the user's email or ID.
    """
    # Make a copy of the data so we don't accidentally modify the original
    to_encode = data.copy()
    
    # Determine when this token should expire (log the user out automatically)
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
        
    # Add the expiration time to the payload under the standard 'exp' key
    to_encode.update({"exp": expire})
    
    # Actually create and sign the token string
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt
