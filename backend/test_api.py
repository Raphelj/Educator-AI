import pytest
from backend.security import get_password_hash, verify_password, create_access_token
from backend.schemas import UserCreate, UserResponse, Token, AskRequest, AskResponse
from jose import jwt
from backend.security import SECRET_KEY, ALGORITHM

def test_password_hashing():
    raw_password = "SecurePassword123!"
    hashed = get_password_hash(raw_password)
    
    assert hashed != raw_password
    assert verify_password(raw_password, hashed) is True
    assert verify_password("WrongPassword", hashed) is False

def test_jwt_token_generation_and_decoding():
    data = {"sub": "testuser@barclays.com"}
    token = create_access_token(data=data)
    
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    assert payload.get("sub") == "testuser@barclays.com"
    assert "exp" in payload

def test_user_create_schema():
    user = UserCreate(email="engineer@enterprise.com", password="StrongPassword1")
    assert user.email == "engineer@enterprise.com"
    assert user.password == "StrongPassword1"

def test_ask_request_schema():
    req = AskRequest(
        document_id="doc-12345",
        question="What is the capital adequacy ratio?"
    )
    assert req.document_id == "doc-12345"
    assert req.question == "What is the capital adequacy ratio?"

def test_token_schema():
    tok = Token(access_token="xyz123token", token_type="bearer")
    assert tok.access_token == "xyz123token"
    assert tok.token_type == "bearer"
