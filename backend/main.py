from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import timedelta
import uuid
from jose import JWTError, jwt

# Import our custom modules
from . import database, models, schemas, security, ai_services
from fastapi.middleware.cors import CORSMiddleware

# 1. Initialize the FastAPI Application
app = FastAPI(title="Educator AI API")

# Add CORS Middleware to allow React to talk to FastAPI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "healthy"}

# 2. Tell SQLAlchemy to create our tables in the database
# First, ensure the vector extension is enabled in PostgreSQL
with database.engine.connect() as conn:
    conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    conn.commit()
models.Base.metadata.create_all(bind=database.engine)

# --- SECURITY DEPENDENCY ---
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(database.get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, security.SECRET_KEY, algorithms=[security.ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    user = db.query(models.User).filter(models.User.email == email).first()
    if user is None:
        raise credentials_exception
    return user


# --- AUTHENTICATION ROUTES ---

@app.post("/signup", response_model=schemas.UserResponse, status_code=status.HTTP_201_CREATED)
def signup(user: schemas.UserCreate, db: Session = Depends(database.get_db)):
    existing_user = db.query(models.User).filter(models.User.email == user.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_pwd = security.get_password_hash(user.password)
    new_user = models.User(email=user.email, hashed_password=hashed_pwd)
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@app.post("/login", response_model=schemas.Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.email == form_data.username).first()
    if not user or not security.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=security.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = security.create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}


# --- PROTECTED AI ROUTES ---

from fastapi import BackgroundTasks

def process_document_in_background(document_id: str, file_bytes: bytes, db: Session):
    try:
        # Step 1: Heavy Extraction & Summarization
        text_content = ai_services.extract_text_from_pdf(file_bytes)
        summary = ai_services.summarize_text(text_content)
        chunks = ai_services.chunk_text(text_content)
        
        # Step 2: Vector Embedding (Very CPU intensive)
        ai_services.build_vector_index(db, document_id, chunks)
        
        # Step 3: Update Document status to complete
        doc = db.query(models.Document).filter(models.Document.id == document_id).first()
        if doc:
            doc.summary = summary
            doc.status = "completed"
            db.commit()
    except Exception as e:
        # Update Document status to failed if something crashes
        doc = db.query(models.Document).filter(models.Document.id == document_id).first()
        if doc:
            doc.status = f"failed: {str(e)}"
            db.commit()

@app.post("/upload")
async def upload_pdf(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...), 
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF")
        
    document_id = str(uuid.uuid4())
    file_bytes = await file.read()
    
    try:
        # Immediately save a placeholder Document with status "processing"
        new_doc = models.Document(
            id=document_id,
            user_id=current_user.id,
            summary=None,
            status="processing"
        )
        db.add(new_doc)
        db.commit()
        
        # Offload all the heavy AI work to a background thread
        background_tasks.add_task(process_document_in_background, document_id, file_bytes, db)
        
        # Return instantly to the user so their browser doesn't freeze
        return {
            "document_id": document_id, 
            "status": "processing",
            "message": "PDF uploaded successfully. AI is analyzing the document in the background."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/documents")
def get_user_documents(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """Retrieve all documents uploaded by the authenticated user."""
    docs = db.query(models.Document).filter(
        models.Document.user_id == current_user.id
    ).order_by(models.Document.created_at.desc()).all()
    
    return [
        {
            "id": doc.id,
            "filename": getattr(doc, "filename", None) or f"Document ({doc.created_at.strftime('%b %d, %H:%M') if doc.created_at else doc.id[:8]})",
            "status": doc.status,
            "created_at": doc.created_at.isoformat() if doc.created_at else None
        }
        for doc in docs
    ]

@app.get("/documents/{document_id}")
def get_document_status(
    document_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    doc = db.query(models.Document).filter(
        models.Document.id == document_id,
        models.Document.user_id == current_user.id
    ).first()
    
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    return {
        "document_id": doc.id,
        "filename": getattr(doc, "filename", None) or f"Document ({doc.created_at.strftime('%b %d, %H:%M') if doc.created_at else doc.id[:8]})",
        "status": doc.status,
        "summary": doc.summary
    }

@app.get("/documents/{document_id}/messages")
def get_document_messages(
    document_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """Fetch persistent chat history for this document and user."""
    doc = db.query(models.Document).filter(
        models.Document.id == document_id,
        models.Document.user_id == current_user.id
    ).first()
    
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    messages = db.query(models.Message).filter(
        models.Message.document_id == document_id,
        models.Message.user_id == current_user.id
    ).order_by(models.Message.created_at.asc()).all()

    return [
        {
            "id": msg.id,
            "role": msg.role,
            "content": msg.content,
            "created_at": msg.created_at.isoformat() if msg.created_at else None
        }
        for msg in messages
    ]

@app.delete("/documents/{document_id}")
def delete_document(
    document_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """Delete a document and all associated messages and vector chunks."""
    doc = db.query(models.Document).filter(
        models.Document.id == document_id,
        models.Document.user_id == current_user.id
    ).first()
    
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    db.delete(doc)
    db.commit()
    return {"message": "Document and conversation deleted successfully", "document_id": document_id}


@app.post("/ask", response_model=schemas.AskResponse)
def ask_question(
    request: schemas.AskRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    try:
        # Pass the question directly to our Agent, which will figure out how to answer it
        answer = ai_services.ask_agent(db, request.document_id, request.question)

        
        # Permanently save Chat History to PostgreSQL
        user_msg = models.Message(user_id=current_user.id, document_id=request.document_id, role="user", content=request.question)
        ai_msg = models.Message(user_id=current_user.id, document_id=request.document_id, role="ai", content=answer)
        
        db.add(user_msg)
        db.add(ai_msg)
        db.commit()
        
        return {"answer": answer}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
