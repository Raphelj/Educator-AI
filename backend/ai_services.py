import os
import pymupdf as fitz
from sentence_transformers import SentenceTransformer
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_groq import ChatGroq
from langgraph.prebuilt import create_react_agent
from langchain_core.tools import Tool
from sqlalchemy.orm import Session
from . import models
from langfuse import observe # Observability!

from dotenv import load_dotenv
load_dotenv()

# === Configuration ===
GROQ_MODEL = "qwen/qwen3.8-27b"
groq_api_key = os.getenv("GROQ_API_KEY")

# Initialize LangChain Groq LLM with max_tokens=400 to strictly respect Groq's 1000 OTPM limit
llm = ChatGroq(
    temperature=0.3,
    model_name=GROQ_MODEL,
    groq_api_key=groq_api_key,
    max_tokens=400
)

embedding_model = SentenceTransformer("all-MiniLM-L6-v2")

@observe() # This decorator tells Langfuse to track everything this function does
def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    return "".join(page.get_text() for page in doc)

@observe()
def chunk_text(text: str, max_tokens: int = 500) -> list[str]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=max_tokens * 4,
        chunk_overlap=200,
        separators=["\n\n", "\n", " ", ""]
    )
    return splitter.split_text(text)

@observe()
def build_vector_index(db: Session, document_id: str, chunks: list[str]):
    if not chunks:
        return
    embeddings = embedding_model.encode(chunks, convert_to_numpy=True)
    for i, chunk in enumerate(chunks):
        doc_chunk = models.DocumentChunk(
            document_id=document_id,
            content=chunk,
            embedding=embeddings[i].tolist()
        )
        db.add(doc_chunk)
    db.commit()

@observe()
def summarize_text(text: str) -> str:
    prompt = f"You are an expert AI educator. Please provide a clear, concise summary in 3-5 bullet points (maximum 150 words):\n\n{text[:4000]}"
    # LangChain LLM invocation
    response = llm.invoke(prompt)
    return response.content.strip()

@observe()
def query_index(db: Session, document_id: str, question: str, top_k=3) -> str:
    """This function acts as a Tool for the Agent to search the PDF."""
    query_embedding = embedding_model.encode([question], convert_to_numpy=True)[0].tolist()
    closest_chunks = db.query(models.DocumentChunk).filter(
        models.DocumentChunk.document_id == document_id
    ).order_by(
        models.DocumentChunk.embedding.l2_distance(query_embedding)
    ).limit(top_k).all()
    
    if not closest_chunks:
        return "No relevant information found in the document."
    return "\n".join([chunk.content for chunk in closest_chunks])

from langfuse.langchain import CallbackHandler

@observe()
def ask_agent(db: Session, document_id: str, question: str) -> str:
    """The Agentic AI Workflow."""
    
    # 1. Define the Tools for the Agent (We are giving it a toolbox)
    tools = [
        Tool(
            name="PDF_Search",
            func=lambda q: query_index(db, document_id, q),
            description="Essential tool: Search the user's active uploaded document for facts, concepts, definitions, or context. Always check this tool first when answering user questions."
        ),
        Tool(
            name="Calculator",
            func=lambda q: str(eval(q)) if all(c in "0123456789+-*/(). " for c in q) else "Invalid Math Expression",
            description="Use this tool whenever you need to perform numerical or arithmetic calculations."
        )
    ]
    
    # 2. System prompt guiding the agent's behavior and tool routing
    system_prompt = (
        "You are an expert AI Educator and Document Analyst. "
        "The user has uploaded a document and is asking questions about it. "
        "ALWAYS use the PDF_Search tool first to retrieve relevant context from the document before answering. "
        "Only answer directly without tools if the question is purely conversational (e.g. 'hello'). "
        "If exact calculations are needed, use the Calculator tool. "
        "Provide clear, concise, and helpful answers grounded in the retrieved document information."
    )

    # 3. Initialize the LangGraph ReAct Agent with system message guidance
    agent = create_react_agent(llm, tools=tools, prompt=system_prompt)
    
    # 4. Fetch previous chat history for multi-turn conversational memory (last 6 turns)
    recent_messages = db.query(models.Message).filter(
        models.Message.document_id == document_id
    ).order_by(models.Message.created_at.asc()).all()[-6:]

    messages_payload = []
    for m in recent_messages:
        role = "user" if m.role == "user" else "assistant"
        messages_payload.append((role, m.content))

    # Append current user question
    messages_payload.append(("user", question))

    # 5. Initialize Langfuse Native Callback (Captures full waterfall execution)
    langfuse_handler = CallbackHandler()
    
    # 6. Run the Agent with full multi-turn conversational context!
    try:
        response = agent.invoke(
            {"messages": messages_payload},
            config={"callbacks": [langfuse_handler]}
        )
        return response["messages"][-1].content
    except Exception as e:
        return f"Agent encountered an error: {str(e)}"
