import os
import re
import uuid
import tempfile
import pymupdf as fitz
import faiss
from sentence_transformers import SentenceTransformer
from groq import Groq
import gradio as gr
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import simpleSplit
from dotenv import load_dotenv

load_dotenv()

# === Configuration ===
GROQ_MODEL = "openai/gpt-oss-20b"
groq_api_key = os.getenv("GROQ_API_KEY")
groq_client = Groq(api_key=groq_api_key)

embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
embedding_dim = 384
index = faiss.IndexFlatL2(embedding_dim)

# === Global Variables ===
texts = []
global_text = ""
global_summary = ""


# === Utility Functions ===
def clean_for_pdf(text: str) -> str:
    """Sanitize text to Latin-1 compatible characters for standard ReportLab canvas."""
    if not text:
        return ""
    text = text.replace("✔", "[x]").replace("✓", "[x]").replace("•", "-")
    return text.encode("latin-1", errors="replace").decode("latin-1")


def extract_text_from_pdf(pdf_path: str) -> str:
    doc = fitz.open(pdf_path)
    return "".join(page.get_text() for page in doc)


def chunk_text(text: str, max_tokens: int = 500) -> list[str]:
    sentences = text.split('.')
    chunks, current = [], ""
    for sent in sentences:
        if len(current) + len(sent) < max_tokens:
            current += sent + "."
        else:
            if current.strip():
                chunks.append(current.strip())
            current = sent + "."
    if current.strip():
        chunks.append(current.strip())
    return chunks


def summarize_text(text: str) -> str:
    prompt = f"""
You are an expert AI educator. Please provide a clear, concise, and well-structured summary of the following content:

Content:
{text[:6000]}

Summary:
"""
    response = groq_client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=600,
        temperature=0.3
    )
    content = response.choices[0].message.content.strip()
    content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()
    return content


def build_faiss_index(chunks: list[str]):
    global texts, index
    if not chunks:
        return
    texts = chunks
    index = faiss.IndexFlatL2(embedding_dim)
    embeddings = embedding_model.encode(chunks, convert_to_numpy=True)
    index.add(embeddings)


def query_index(question: str, top_k=3) -> list[str]:
    if index.ntotal == 0 or not texts:
        return []
    query_embedding = embedding_model.encode([question], convert_to_numpy=True)
    D, I = index.search(query_embedding, top_k)
    return [texts[i] for i in I[0] if 0 <= i < len(texts)]


def get_answer_from_context(question: str, context: str) -> str:
    prompt = f"""
You are an AI educator. Based only on the given context, answer the question below accurately and concisely.

Context:
{context[:4000]}

Question:
{question}

Answer:
"""
    response = groq_client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=500,
        temperature=0.3
    )
    content = response.choices[0].message.content.strip()
    content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()
    return content


def generate_mcqs_from_text(text: str, num_questions: int = 5) -> str:
    prompt = f"""
You are an AI educator. Based on the following content, generate {num_questions} multiple choice questions with 4 options each.
Clearly mark the correct answer. Format the output as:

Q1. ...
a) ...
b) ...
c) ...
d) ...
Answer: ...

Content:
{text[:5000]}
"""
    response = groq_client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=700,
        temperature=0.3
    )
    content = response.choices[0].message.content.strip()
    content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()
    return content


def generate_pdf_report(summary, question, answer, mcqs, output_path):
    c = canvas.Canvas(output_path, pagesize=letter)
    width, height = letter
    y = height - 50

    def draw_text_block(title, content, y_pos):
        c.setFont("Helvetica-Bold", 14)
        c.drawString(40, y_pos, clean_for_pdf(title))
        y_pos -= 20
        c.setFont("Helvetica", 11)
        wrapped = simpleSplit(clean_for_pdf(content), "Helvetica", 11, width - 80)
        for line in wrapped:
            c.drawString(40, y_pos, line)
            y_pos -= 15
            if y_pos < 60:
                c.showPage()
                y_pos = height - 50
                c.setFont("Helvetica", 11)
        return y_pos - 15

    y = draw_text_block("Summary", summary, y)
    y = draw_text_block("Question", question, y)
    y = draw_text_block("Answer", answer, y)
    y = draw_text_block("Generated MCQs", mcqs, y)
    c.save()


# === Gradio Callbacks ===
def upload_and_summarize_gr(file_path):
    global global_text, global_summary
    if not file_path:
        return "Please select and upload a valid PDF file."
    global_text = extract_text_from_pdf(file_path)
    global_summary = summarize_text(global_text)
    chunks = chunk_text(global_text)
    build_faiss_index(chunks)
    return global_summary


def ask_and_generate_gr(question):
    if not global_text:
        return "Please upload a PDF document first.", "", None
    if not question or not question.strip():
        return "Please enter a question.", "", None

    context = "\n".join(query_index(question))
    if not context:
        context = global_text[:2000]
    
    answer = get_answer_from_context(question, context)
    mcqs = generate_mcqs_from_text(global_summary or global_text)
    pdf_path = os.path.join(tempfile.gettempdir(), f"report_{uuid.uuid4().hex}.pdf")
    generate_pdf_report(global_summary, question, answer, mcqs, pdf_path)
    return answer, mcqs, pdf_path


# === Gradio UI Setup ===
with gr.Blocks(title="Educator AI") as gradio_app:
    gr.Markdown("## 🎓 Educator AI\nUpload a PDF to summarize. Then ask questions and generate MCQs.")

    with gr.Row():
        with gr.Column():
            file_input = gr.File(label="Upload PDF", type="filepath")
            summary_output = gr.Textbox(label="Summary", lines=10)
            file_input.change(fn=upload_and_summarize_gr, inputs=file_input, outputs=summary_output)

        with gr.Column():
            question_input = gr.Textbox(label="Ask a Question")
            answer_output = gr.Textbox(label="Answer", lines=2)
            mcq_output = gr.Textbox(label="Generated MCQs", lines=8)
            download_output = gr.File(label="Download Report (PDF)")
            question_input.submit(
                fn=ask_and_generate_gr,
                inputs=question_input,
                outputs=[answer_output, mcq_output, download_output]
            )

# === Launch ===
if __name__ == "__main__":
    gradio_app.launch()